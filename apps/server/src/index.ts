import { config as loadEnv } from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from '@stickman/shared';
import { GameDatabase } from './db.js';
import { RoomManager } from './roomManager.js';

loadEnv();
const monorepoEnvPath = resolve(process.cwd(), '../../.env');
if (existsSync(monorepoEnvPath)) loadEnv({ path: monorepoEnvPath, override: false });

const port = Number(process.env.PORT ?? 3000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? true;
const dbPath = resolve(process.env.DB_PATH ?? './data/stickman-office-party.db');

const app = express();
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: { origin: clientOrigin, credentials: true },
  transports: ['websocket', 'polling'],
  perMessageDeflate: true
});

const db = new GameDatabase(dbPath);
const rooms = new RoomManager(io, db);

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'stickman-office-party', now: new Date().toISOString() });
});

io.on('connection', (socket) => {
  socket.on('room:create', (payload, ack) => {
    const result = rooms.createRoom(socket.id, payload);
    if ('error' in result) return ack({ ok: false, error: result.error });
    socket.data.playerId = payload.playerId;
    socket.data.roomCode = result.roomCode;
    socket.join(result.roomCode);
    rooms.bindSocket(socket.id, payload.playerId, result.roomCode);
    const snapshot = rooms.getRoomSnapshot(result.roomCode);
    if (snapshot) socket.emit('room:snapshot', snapshot);
    ack({ ok: true, data: result });
  });

  socket.on('room:join', (payload, ack) => {
    const result = rooms.joinRoom(socket.id, payload);
    if ('error' in result) return ack({ ok: false, error: result.error });
    socket.data.playerId = payload.playerId;
    socket.data.roomCode = result.roomCode;
    socket.join(result.roomCode);
    rooms.bindSocket(socket.id, payload.playerId, result.roomCode);
    const snapshot = rooms.getRoomSnapshot(result.roomCode);
    if (snapshot) socket.emit('room:snapshot', snapshot);
    ack({ ok: true, data: result });
  });

  socket.on('room:ready', (ready) => {
    if (socket.data.playerId && socket.data.roomCode) rooms.setReady(socket.data.playerId, socket.data.roomCode, ready);
  });

  socket.on('room:settings', (settings) => {
    if (socket.data.playerId && socket.data.roomCode) rooms.updateSettings(socket.data.playerId, socket.data.roomCode, settings);
  });

  socket.on('room:vote', (miniGame) => {
    if (socket.data.playerId && socket.data.roomCode) rooms.vote(socket.data.playerId, socket.data.roomCode, miniGame);
  });

  socket.on('room:start', () => {
    if (socket.data.playerId && socket.data.roomCode) rooms.startGame(socket.data.playerId, socket.data.roomCode);
  });

  socket.on('room:resetParty', () => {
    if (socket.data.playerId && socket.data.roomCode) rooms.resetParty(socket.data.playerId, socket.data.roomCode);
  });

  socket.on('chat:send', (text) => {
    if (socket.data.playerId && socket.data.roomCode) rooms.sendChat(socket.data.playerId, socket.data.roomCode, text);
  });

  socket.on('emoji:send', (emoji) => {
    if (socket.data.playerId && socket.data.roomCode) rooms.sendEmoji(socket.data.playerId, socket.data.roomCode, emoji);
  });

  socket.on('tank:input', (input) => {
    if (socket.data.playerId && socket.data.roomCode) rooms.applyTankInput(socket.data.playerId, socket.data.roomCode, input);
  });

  socket.on('disconnect', () => rooms.disconnect(socket.data.playerId, socket.data.roomCode));
});

const currentDir = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(currentDir, '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_request, response) => response.sendFile(resolve(webDist, 'index.html')));
}

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Stickman Office Party server listening on http://0.0.0.0:${port}`);
});
