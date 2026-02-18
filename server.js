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
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
        methods: ['GET', 'POST'],
    },
});//Socket.io instance attached to a http server, with CORS configuration to allow connection from frontend origin

// Allow React dev server (3000) to call backend APIs (7000) without proxy.
app.use(
    cors({
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
        credentials: true,
    })
);

app.use(express.json({ limit: '1mb' }));

/**
 * OneCompiler via RapidAPI proxy (keeps UI simple + keeps API key off the browser)
 * Docs: https://rapidapi.com/onecompiler/api/onecompiler-apis
 */
const RAPIDAPI_KEY = process.env.ONECOMPILER_ACCESS_TOKEN || process.env.RAPIDAPI_KEY || '90baf05c21msh725a289891fd416p1a666cjsne82eb5a76fe6';
const RAPIDAPI_HOST = 'onecompiler-apis.p.rapidapi.com';

if (!RAPIDAPI_KEY) {
    console.warn('[OneCompiler/RapidAPI] RAPIDAPI_KEY is NOT set (did you create a .env file?)');
} else {
    const masked =
        RAPIDAPI_KEY.length <= 8
            ? '********'
            : `${RAPIDAPI_KEY.slice(0, 4)}********${RAPIDAPI_KEY.slice(-4)}`;
    console.log(`[OneCompiler/RapidAPI] API key loaded: ${masked}`);
}

function oneCompilerHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
    };
}

let oneCompilerLanguagesCache = { fetchedAt: 0, data: null };
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

app.get('/api/onecompiler/languages', async (req, res) => {
    try {
        const now = Date.now();
        if (
            oneCompilerLanguagesCache.data &&
            now - oneCompilerLanguagesCache.fetchedAt < ONE_DAY_MS
        ) {
            return res.json(oneCompilerLanguagesCache.data);
        }

        // OneCompiler languages list is available via their public endpoint.
        // RapidAPI does NOT provide /api/v1/languages (it returns 404).
        // Source: https://onecompiler.com/apis/code-execution
        const r = await fetch(`https://onecompiler.com/api/v1/languages`, {
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            return res.status(r.status).json({
                error: 'Failed to fetch OneCompiler languages',
                details: data,
            });
        }

        oneCompilerLanguagesCache = { fetchedAt: now, data };
        return res.json(data);
    } catch (e) {
        return res
            .status(500)
            .json({ error: 'OneCompiler languages request failed', details: String(e) });
    }
});

app.post('/api/onecompiler/run', async (req, res) => {
    try {
        if (!RAPIDAPI_KEY) {
            return res.status(500).json({
                error:
                    'Server is missing RAPIDAPI_KEY (or ONECOMPILER_ACCESS_TOKEN). Set it in your environment before running.',
            });
        }

        const { language, code, stdin } = req.body || {};
        if (typeof language !== 'string' || !language.trim()) {
            return res.status(400).json({ error: '`language` is required' });
        }
        if (typeof code !== 'string' || !code.trim()) {
            return res.status(400).json({ error: '`code` is required' });
        }

        const fileNameByLanguage = {
            javascript: 'main.js',
            nodejs: 'main.js',
            typescript: 'main.ts',
            python: 'main.py',
            python2: 'main.py',
            java: 'Main.java',
            cpp: 'main.cpp',
            c: 'main.c',
            csharp: 'main.cs',
            go: 'main.go',
            ruby: 'main.rb',
            php: 'main.php',
        };

        const r = await fetch(`https://${RAPIDAPI_HOST}/api/v1/run`, {
            method: 'POST',
            headers: oneCompilerHeaders(),
            body: JSON.stringify({
                language: language.trim(),
                stdin: typeof stdin === 'string' || Array.isArray(stdin) ? stdin : '',
                files: [
                    {
                        name: fileNameByLanguage[language.trim()] || 'main.txt',
                        content: code,
                    },
                ],
            }),
        });

        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            return res.status(r.status).json({
                error: 'Failed to run code on OneCompiler',
                details: data,
            });
        }

        return res.json(data);
    } catch (e) {
        return res
            .status(500)
            .json({ error: 'OneCompiler run request failed', details: String(e) });
    }
});

const userSocketMap = {};
function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(//io.sockets.adapter.rooms.get(roomId) this gives set{socketId1, socketId2, socketId3}  Array.from(...) converts set to Array
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


const PORT = process.env.PORT || 7000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
