import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { io } from 'socket.io-client';

const port = 3199;
const baseUrl = `http://127.0.0.1:${port}`;
const dbPath = resolve('./data/smoke-test.db');
rmSync(dbPath, { force: true });
rmSync(`${dbPath}-shm`, { force: true });
rmSync(`${dbPath}-wal`, { force: true });

const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
  env: { ...process.env, PORT: String(port), DB_PATH: dbPath, CLIENT_ORIGIN: baseUrl },
  stdio: ['ignore', 'pipe', 'pipe']
});

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const waitForServer = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('Server did not become healthy.');
};

const once = (socket, event, timeoutMs = 3000) => new Promise((resolvePromise, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
  socket.once(event, (payload) => {
    clearTimeout(timeout);
    resolvePromise(payload);
  });
});

let alice;
let bob;
try {
  await waitForServer();
  alice = io(baseUrl, { transports: ['websocket'] });
  bob = io(baseUrl, { transports: ['websocket'] });
  await Promise.all([once(alice, 'connect'), once(bob, 'connect')]);

  const created = await new Promise((resolvePromise) => {
    alice.emit('room:create', {
      playerId: 'smoke-alice', nickname: 'Alice', avatarColor: '#7c5cff'
    }, resolvePromise);
  });
  if (!created.ok) throw new Error(created.error || 'Create room failed.');
  const roomCode = created.data.roomCode;

  const joined = await new Promise((resolvePromise) => {
    bob.emit('room:join', {
      playerId: 'smoke-bob', nickname: 'Bob', avatarColor: '#22c55e', roomCode
    }, resolvePromise);
  });
  if (!joined.ok) throw new Error(joined.error || 'Join room failed.');

  alice.emit('room:ready', true);
  bob.emit('room:ready', true);
  await sleep(120);
  const snapshotPromise = once(alice, 'tank:snapshot');
  alice.emit('room:start');
  const snapshot = await snapshotPromise;

  if (snapshot.tanks.length !== 2 || snapshot.round !== 1) {
    throw new Error(`Unexpected Tank Battle state: ${JSON.stringify(snapshot)}`);
  }

  console.log(`Smoke test passed: room ${roomCode}, ${snapshot.tanks.length} tanks, round ${snapshot.round}.`);
} finally {
  alice?.disconnect();
  bob?.disconnect();
  server.kill('SIGTERM');
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
}
