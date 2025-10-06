const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

let rooms = {};

io.on('connection', socket => {

    // Join room
    socket.on('joinRoom', ({roomCode, name}) => {
        if(!rooms[roomCode]) rooms[roomCode] = {
            host: null,
            players: [],
            sectorsUnlocked: 3,
            investments: {},
            tips: [],
            impostor: null,
            gameStarted:false
        };
        const room = rooms[roomCode];

        // Assign host if first to join
        if(!room.host) room.host = socket.id;

        // Assign impostor (first non-host)
        const role = (!room.impostor && socket.id !== room.host) ? 'impostor' : 'investor';
        if(role==='impostor') room.impostor = socket.id;

        room.players.push({id: socket.id, name, role, investment:{}});

        io.to(socket.id).emit('roleAssignment', role, room.sectorsUnlocked, room.host===socket.id);
        io.to(roomCode).emit('updatePlayers', room.players.map(p=>p.name));
    });

    // Start game (host only)
    socket.on('startGame', roomCode => {
        const room = rooms[roomCode];
        if(room.host === socket.id) {
            room.gameStarted = true;
            io.to(roomCode).emit('gameStarted', room.sectorsUnlocked);
        }
    });

    // Flash news
    socket.on('flashNews', ({roomCode, sector, message}) => {
        io.to(roomCode).emit('newsFlashed', {sector, message});
    });

    // Unlock sectors
    socket.on('unlockSectors', ({roomCode, newUnlock}) => {
        const room = rooms[roomCode];
        room.sectorsUnlocked = newUnlock;
        io.to(roomCode).emit('sectorsUnlocked', newUnlock);
    });

    // Submit investments
    socket.on('submitInvestment', ({roomCode, investments}) => {
        const room = rooms[roomCode];
        const player = room.players.find(p=>p.id===socket.id);
        if(player) player.investment = investments;
        io.to(roomCode).emit('updateInvestments', room.players.map(p=>({name:p.name, investment:p.investment})));
    });

    // Send tip (impostor)
    socket.on('sendTip', ({roomCode, targetName, message}) => {
        io.to(roomCode).emit('receiveTip', {targetName, message});
    });

    // End game
    socket.on('endGame', roomCode => {
        const room = rooms[roomCode];
        let scores = room.players.map(p=>{
            let total=0;
            for(const sec in p.investment) total += p.investment[sec];
            return {name:p.name, score:total};
        });
        scores.sort((a,b)=>b.score-a.score);
        io.to(roomCode).emit('gameEnded', {winner:scores[0], impostorId:room.impostor, scores});
    });

    socket.on('disconnect', () => {
        for(const code in rooms){
            const room = rooms[code];
            room.players = room.players.filter(p=>p.id!==socket.id);
        }
    });
});

http.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
