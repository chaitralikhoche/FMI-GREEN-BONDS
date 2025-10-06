// server.js
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

    // Create/join room
    socket.on('joinRoom', ({roomCode, name}) => {
        socket.join(roomCode);
        if(!rooms[roomCode]) rooms[roomCode] = {host: null, players: [], sectorsUnlocked: 3, investments: {}, tips: [], impostor: null, gameStarted:false};
        const room = rooms[roomCode];

        // Assign host if first connection
        if(!room.host) room.host = socket.id;

        const role = room.impostor || room.players.length >= 1 ? 'investor' : 'impostor';
        if(role === 'impostor' && !room.impostor) room.impostor = socket.id;

        room.players.push({id: socket.id, name, role, investment: {}});
        io.to(roomCode).emit('updatePlayers', room.players.map(p=>p.name));
        socket.emit('roleAssignment', role, room.sectorsUnlocked);
    });

    // Host starts game
    socket.on('startGame', roomCode => {
        if(rooms[roomCode].host === socket.id) {
            rooms[roomCode].gameStarted = true;
            io.to(roomCode).emit('gameStarted', rooms[roomCode].sectorsUnlocked);
        }
    });

    // Host flashes news
    socket.on('flashNews', ({roomCode, sector, message}) => {
        io.to(roomCode).emit('newsFlashed', {sector, message});
    });

    // Host unlocks sectors
    socket.on('unlockSectors', ({roomCode, newUnlock}) => {
        const room = rooms[roomCode];
        room.sectorsUnlocked = newUnlock;
        io.to(roomCode).emit('sectorsUnlocked', newUnlock);
    });

    // Investors submit investments
    socket.on('submitInvestment', ({roomCode, investments}) => {
        const room = rooms[roomCode];
        const player = room.players.find(p=>p.id===socket.id);
        if(player) player.investment = investments;
        io.to(roomCode).emit('updateInvestments', room.players.map(p=>({name:p.name, investment:p.investment})));
    });

    // Impostor sends tip
    socket.on('sendTip', ({roomCode, targetName, message}) => {
        const room = rooms[roomCode];
        io.to(roomCode).emit('receiveTip', {targetName, message});
    });

    // End game & calculate winner
    socket.on('endGame', roomCode => {
        const room = rooms[roomCode];
        let scores = room.players.map(p=>{
            let total = 0;
            for(const sec in p.investment){
                total += p.investment[sec]; // simple total for now
            }
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
