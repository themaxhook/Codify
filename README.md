# Codify — Real-Time Collaborative Code Editor

A real-time collaborative code editor where multiple developers can join a shared room and write code together simultaneously — like Google Docs, but for code.

🔗 **Live Demo:** [codify.onrender.com](https://codify.onrender.com)  
📁 **GitHub:** [github.com/themaxhook/Codify](https://github.com/themaxhook/Codify)

---

## What it Does

- Join or create a room with a unique Room ID
- Write code together in real-time — changes reflect instantly across all connected users
- Switch between 30+ languages with syntax highlighting
- Run code directly in the browser via OneCompiler API
- See who's connected in the room sidebar

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, CodeMirror, Socket.IO client |
| Backend | Node.js, Express, Socket.IO |
| State | Redis (ioredis) |
| Code Execution | OneCompiler API (via RapidAPI) |
| Deployment | Render (web service + managed Redis) |
| Container | Docker (multi-stage build) |

---

## Architecture

```
Clients (React + CodeMirror)
        │
        │  WebSocket (Socket.IO)
        ▼
Node.js Server (port 7000)
        │
        ├── userSocketMap      → socketId : username
        ├── adapter.rooms      → roomId : Set of socketIds
        ├── roomQueues         → roomId : Queue of pending changes
        └── isProcessing       → roomId : boolean (queue guard)
        │
        ├── Event Queue (per room)
        │     └── FIFO processing → saves to Redis → broadcasts
        │
        └── Redis
              ├── room:{roomId}:code  → latest code (source of truth)
              └── Served to new users on JOIN via ROOM_STATE event
```

---

## Key Engineering Decisions

### 1. Race Condition Prevention — Server-Side Event Queue

**Problem:** When two users type simultaneously, without any ordering guarantee the final state is unpredictable. Different users could end up seeing different code.

**Solution:** Every `CODE_CHANGE` event is pushed into a per-room queue (HashMap of Queues). A single processor picks changes up one by one in FIFO order — serializing all concurrent writes.

```js
// Every change pushed into room's queue
roomQueues[roomId].push({ code, socketId });
processQueue(roomId);

// Processor runs one at a time per room
async function processQueue(roomId) {
    if (isProcessing[roomId]) return;
    isProcessing[roomId] = true;
    while (roomQueues[roomId].length > 0) {
        const { code, socketId } = roomQueues[roomId].shift();
        await redis.set(`room:${roomId}:code`, code);
        io.to(roomId).except(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    }
    isProcessing[roomId] = false;
}
```

### 2. Redis as Single Source of Truth

**Problem:** New users joining mid-session got code from another user's browser — unreliable, slow, and broken if that user disconnected.

**Solution:** After every processed change, the latest code is saved to Redis. When a new user joins, they get code directly from Redis via a `ROOM_STATE` event — no peer-to-peer dependency.

```js
// On new user JOIN
const savedCode = await redis.get(`room:${roomId}:code`);
if (savedCode) {
    socket.emit(ACTIONS.ROOM_STATE, { code: savedCode });
}
```

### 3. Cursor Position Fix

**Problem:** After adding Redis, every keystroke caused the cursor to jump to position 0. CodeMirror's `setValue()` resets cursor when the sender received their own broadcast back.

**Solution:** Used Socket.IO's `except()` to exclude the sender from broadcasts.

```js
// Exclude sender → cursor stays in place
io.to(roomId).except(socketId).emit(ACTIONS.CODE_CHANGE, { code });
```

---

## Socket Events

| Event | Direction | Purpose |
|---|---|---|
| `JOIN` | Client → Server | User joins a room |
| `JOINED` | Server → All clients | Notify room of new user |
| `CODE_CHANGE` | Both | Sync code changes |
| `ROOM_STATE` | Server → New user | Send current code from Redis |
| `DISCONNECTED` | Server → All clients | Notify room user left |
| `SYNC_CODE` | Client → Server | Legacy fallback sync |

---

## Data Flow

```
User types in editor
    └─► CodeMirror change event (origin !== 'setValue')
    └─► emit CODE_CHANGE { roomId, code }
    └─► Server pushes to roomQueues[roomId]
    └─► processQueue runs (FIFO)
    └─► redis.set → latest code saved
    └─► broadcast to room except sender
    └─► Other users' editors update via setValue()
```

```
New user joins
    └─► emit JOIN { roomId, username }
    └─► Server: socket.join(roomId)
    └─► Server: redis.get room code
    └─► emit ROOM_STATE → new user's editor populated
```

---

## Running Locally

### Prerequisites

- Node.js 18+
- Redis (via WSL Ubuntu on Windows, or native on Mac/Linux)

### Setup

```bash
# Clone the repo
git clone https://github.com/themaxhook/Codify.git
cd Codify

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Add your RAPIDAPI_KEY for OneCompiler

# Start Redis (Ubuntu/WSL)
sudo service redis-server start

# Start backend
node server.js

# Start frontend (new terminal)
npm run start:front
```

### With Docker Compose

```bash
docker-compose up
```

Starts both the app and Redis automatically.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `7000` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `RAPIDAPI_KEY` | OneCompiler API key | — |
| `CLIENT_ORIGIN` | Allowed CORS origin | `*` |

---

## Deployment

Deployed on **Render** as a single web service. The Node.js server serves the React build as static files — no separate frontend hosting needed.

```
Render Web Service → node server.js
                     ├── serves /build (React frontend)
                     ├── handles /api routes
                     └── handles WebSocket connections

Render Redis       → managed Redis instance
                     connected via REDIS_URL env variable
```

---

## What I Learned

- Race conditions in real-time systems are subtle — two simultaneous writes with no ordering guarantee produce unpredictable state
- Redis as an in-memory store is dramatically faster and more reliable than peer-to-peer sync for shared state
- CodeMirror's `setValue()` resets cursor position — always exclude the sender from broadcasts
- Single-server deployments with Express serving static files simplify infrastructure and eliminate CORS issues
- The difference between transport-layer reconnection (Socket.IO handles) and application-state recovery (you handle)

---

## Future Improvements

- Cursor position sharing between users
- Room authentication with passwords
- Persistent document saving (MongoDB)
- CRDT-based conflict resolution (Yjs) for true offline support
- Redis Adapter for horizontal scaling across multiple servers

---

## License

MIT
