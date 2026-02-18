const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();
const { Server } = require('socket.io');
const ACTIONS = require('./src/Actions');

const server = http.createServer(app);//creating a http server bcz socket.io must connected to http server
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_ORIGIN || '*',
        methods: ['GET', 'POST'],
    },
});//Socket.io instance attached to a http server, with CORS configuration to allow connection from frontend origin

// Allow React dev server (3000) to call backend APIs (7000) without proxy.
app.use(
    cors({
        origin: process.env.CLIENT_ORIGIN || '*',
        credentials: true,
    })
);

app.use(express.json({ limit: '1mb' }));

const onecompilerRouter = require('./routes/onecompiler');
app.use('/api/onecompiler', onecompilerRouter);

const userSocketMap = {};
function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

io.on('connection', (socket) => {//This runs every time a new user connects via WebSocket.
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });//here socket.in sends code to all everyone except sender if we use io.to it will sends to all includes senders too and create uneccesary re-render
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {//whenever new user joins they need current code state , so flow is existing user sends full code to server , then server sends it to only new user joined,  new user get latest code instantly
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on('disconnecting', () => {// this runs when socket fully disconnects.
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        // but but but when a socket(user) disconnects Socket.io automatically remove it from all rooms
        //Socket.IO is a JavaScript library that enables real-time, bidirectional communication between client and server.
        socket.leave();//remove socket from room
    });
});

/* ================= PRODUCTION STATIC SERVING ================= */
// Serve React build in production
app.use(express.static(path.join(__dirname, 'build')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});
/* ============================================================= */

const PORT = process.env.PORT || 7000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
