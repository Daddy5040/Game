# Architecture

## System overview

```text
Browser A ─┐
Browser B ─┼── Socket.IO/WebSocket ── Express + authoritative game loop ── SQLite
Browser C ─┘                 │
                             └── serves the compiled React application
```

The client is responsible for presentation, input collection, sound, particles, and interpolation. It never decides whether a hit, elimination, score, or victory is valid. The server owns room membership, settings, game clocks, physics, collisions, damage, scores, and persistence.

## Monorepo

```text
stickman-office-party/
├── apps/
│   ├── web/                 React UI and Canvas renderer
│   └── server/              Express, Socket.IO, SQLite, game simulation
├── packages/
│   └── shared/              Event contracts and serializable state types
├── docs/
├── Dockerfile
└── docker-compose.yml
```

## Runtime responsibilities

### Web client

- Stores the generated player ID in `localStorage`.
- Sends nickname/color only when creating or joining a room.
- Sends compact input frames at approximately 20 Hz.
- Renders server snapshots at the display refresh rate.
- Provides responsive lobby, chat, settings, scoreboard, touch controls, and spectator UI.

### Server

- Generates six-character private room codes.
- Supports reconnection by stable player ID.
- Validates host-only actions and room capacity.
- Runs each Tank Battle at 30 simulation ticks per second.
- Broadcasts snapshots at 20 Hz.
- Persists players, rooms, matches, standings, and achievements.
- Serves the React build in production.

### Database

SQLite is the default because it requires no external service and works well for LAN/VPS deployment. The schema deliberately uses standard SQL types so it can be migrated to PostgreSQL later. Replace the database adapter without changing Socket.IO contracts or game logic.

## Server-authoritative anti-cheat model

1. The client sends directional buttons, aim coordinates, a shooting flag, and an increasing sequence number.
2. The server clamps aim coordinates and ignores stale sequence numbers.
3. The simulation applies maximum speed, cooldowns, arena bounds, obstacle collisions, bullet lifetime, damage, and elimination.
4. Clients receive read-only snapshots and event effects.
5. Only the server updates match and party scores.

## Horizontal scaling

The MVP uses in-memory rooms, which is ideal for one VPS or an office LAN. To scale across instances:

- Add the Socket.IO Redis adapter.
- Store room ownership in Redis.
- Pin each active game simulation to one worker.
- Publish snapshots through Redis streams or pub/sub.
- Move SQLite to PostgreSQL.

## Low-bandwidth strategy

- Input payloads contain booleans and two coordinates only.
- Snapshot frequency is 20 Hz rather than one message per rendered frame.
- State excludes UI-only data.
- Chat is capped at 50 messages per room.
- Client effects are generated locally from compact game events.
- A future optimization can delta-compress snapshots and quantize positions to 16-bit integers.
