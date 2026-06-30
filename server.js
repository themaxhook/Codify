const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const { Server } = require('socket.io');
const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');
const ACTIONS = require('./src/Actions');
const mongoose = require('mongoose');
const Room = require('./models/Room');
const roomRouter = require('./routes/room');

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

app.use('/api/room', roomRouter);

// ─── REDIS SETUP ────────────────────────────────────────────────
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('Redis connected ✅'));
redis.on('error', (err) => console.error('Redis error:', err));
// ────────────────────────────────────────────────────────────────

// ─── REDIS ADAPTER (for horizontal scaling across multiple servers) ──
// Without this, broadcasts only reach users connected to THIS server.
// With this, io.to(room).emit() reaches users on ALL server instances
// via Redis Pub/Sub — no other code changes needed for broadcasting.
const pubClient = redis.duplicate();
const subClient = redis.duplicate();
io.adapter(createAdapter(pubClient, subClient));
// ───────────────────────────────────────────────────────────────────

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected ✅'))
    .catch((err) => console.error('MongoDB error:', err));

// ─── userSocketMap → moved to Redis Hash ─────────────────────────
// Was: const userSocketMap = {};  (server memory, single server only)
// Now: stored under Redis hash key "userSocketMap" so ANY server
// instance can look up a username by socketId — required for scaling.
// ───────────────────────────────────────────────────────────────────

// ─── QUEUE SYSTEM ───────────────────────────────────────────────
// One queue per room. Each queue is a list of pending code changes.
// isProcessing lock ensures only one server processes a room's
// queue at a time — both now live in Redis instead of server memory
// so they're shared across every server instance.
// roomQueues → Redis List   key: room:{roomId}:queue
// isProcessing → Redis NX lock   key: room:{roomId}:lock

// Updated queue — stores { code, socketId } instead of just code
async function processQueue(roomId) {
    // Try to acquire the lock atomically. NX = only set if not exists,
    // PX = auto-expire after 5000ms so a crashed server can't deadlock
    // the room forever.
    const lock = await redis.set(`room:${roomId}:lock`, '1', 'NX', 'PX', 5000);
    if (!lock) return;

    while (true) {
        const item = await redis.lpop(`room:${roomId}:queue`); // ← destructure
        if (!item) break;

        const { code, socketId } = JSON.parse(item);

        await redis.set(`room:${roomId}:code`, code);

        // Send to everyone in room EXCEPT the person who sent it
        io.to(roomId).except(socketId).emit(ACTIONS.CODE_CHANGE, { code }); // ← fixed
    }

    await redis.del(`room:${roomId}:lock`);
}
// ────────────────────────────────────────────────────────────────

function getAllConnectedClients(roomId) {
    const socketIds = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    return Promise.all(
        socketIds.map(async (socketId) => ({
            socketId,
            username: await redis.hget('userSocketMap', socketId),
        }))
    );
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

   // Update your JOIN handler — add MongoDB fallback
socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
    await redis.hset('userSocketMap', socket.id, username);
    socket.join(roomId);

    const clients = await getAllConnectedClients(roomId);
    clients.forEach(({ socketId }) => {
        io.to(socketId).emit(ACTIONS.JOINED, {
            clients,
            username,
            socketId: socket.id,
        });
    });

    // Try Redis first
    let savedCode = await redis.get(`room:${roomId}:code`);

    // If Redis is empty, fallback to MongoDB
    if (savedCode === null) {
        const room = await Room.findOne({ roomId });
        if (room) {
            savedCode = room.code;
            await redis.set(`room:${roomId}:code`, savedCode); // re-cache in Redis
        }
    }

    if (savedCode !== null) {
        socket.emit(ACTIONS.ROOM_STATE, { code: savedCode });
    }
});

    // ── NEW: Queue-based CODE_CHANGE ──────────────────────────
   socket.on(ACTIONS.CODE_CHANGE, async ({ roomId, code }) => {
    // Push both code AND socketId so processQueue knows who sent it
    await redis.rpush(`room:${roomId}:queue`, JSON.stringify({ code, socketId: socket.id })); // ← updated

    processQueue(roomId);
});
    // ─────────────────────────────────────────────────────────

    // SYNC_CODE kept for backward compatibility but
    // new users now get code via ROOM_STATE from Redis
    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on('disconnecting', async () => {
        const rooms = [...socket.rooms];
        const username = await redis.hget('userSocketMap', socket.id);
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username,
            });
        });
        await redis.hdel('userSocketMap', socket.id);
        socket.leave();
    });
});

app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 7000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));