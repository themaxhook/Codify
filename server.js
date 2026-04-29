const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const { Server } = require('socket.io');
const Redis = require('ioredis');
const ACTIONS = require('./src/Actions');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_ORIGIN || '*',
        methods: ['GET', 'POST'],
    },
});

app.use(cors({
    origin: process.env.CLIENT_ORIGIN || '*',
    credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

const onecompilerRouter = require('./routes/onecompiler');
app.use('/api/onecompiler', onecompilerRouter);

// ─── REDIS SETUP ────────────────────────────────────────────────
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('Redis connected ✅'));
redis.on('error', (err) => console.error('Redis error:', err));
// ────────────────────────────────────────────────────────────────

const userSocketMap = {};

// ─── QUEUE SYSTEM ───────────────────────────────────────────────
// One queue per room. Each queue is an array of pending code changes.
// isProcessing flag ensures only one change is processed at a time per room.
const roomQueues = {};       // { roomId: [code, code, ...] }
const isProcessing = {};     // { roomId: true/false }

// Updated queue — stores { code, socketId } instead of just code
async function processQueue(roomId) {
    if (isProcessing[roomId]) return;
    isProcessing[roomId] = true;

    while (roomQueues[roomId] && roomQueues[roomId].length > 0) {
        const { code, socketId } = roomQueues[roomId].shift(); // ← destructure

        await redis.set(`room:${roomId}:code`, code);

        // Send to everyone in room EXCEPT the person who sent it
        io.to(roomId).except(socketId).emit(ACTIONS.CODE_CHANGE, { code }); // ← fixed
    }

    isProcessing[roomId] = false;
}
// ────────────────────────────────────────────────────────────────

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => ({
            socketId,
            username: userSocketMap[socketId],
        })
    );
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);

        const clients = getAllConnectedClients(roomId);

        // Notify everyone in the room someone joined
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });

        // ── NEW: Send current code from Redis to the new user ──
        // This replaces the old SYNC_CODE approach.
        // We get the code directly from Redis, not from another user.
        const savedCode = await redis.get(`room:${roomId}:code`);
        if (savedCode !== null) {
            socket.emit(ACTIONS.ROOM_STATE, { code: savedCode });
        }
        // ───────────────────────────────────────────────────────
    });

    // ── NEW: Queue-based CODE_CHANGE ──────────────────────────
   socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    if (!roomQueues[roomId]) roomQueues[roomId] = [];

    // Push both code AND socketId so processQueue knows who sent it
    roomQueues[roomId].push({ code, socketId: socket.id }); // ← updated

    processQueue(roomId);
});
    // ─────────────────────────────────────────────────────────

    // SYNC_CODE kept for backward compatibility but
    // new users now get code via ROOM_STATE from Redis
    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 7000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));