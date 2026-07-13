# Socket.IO protocol

All contracts are defined in `packages/shared/src/index.ts` and are type-checked on both sides.

## Client → server

| Event | Purpose | Authority checks |
|---|---|---|
| `room:create` | Create a private room | Valid nickname and color |
| `room:join` | Join or reconnect | Room exists; active slots ≤ 8 |
| `room:ready` | Toggle ready state | Active room member only |
| `room:settings` | Change rounds/time/rules | Host only; lobby/results only |
| `room:vote` | Vote for a mini-game | Active member only |
| `room:start` | Start Tank Battle | Host, ≥2 active players, all ready |
| `room:resetParty` | Reset overall scores | Host only |
| `chat:send` | Send lobby message | Member; server truncates text |
| `emoji:send` | Broadcast reaction | Member; server allow-list |
| `tank:input` | Movement/aim/fire intent | Playing active member; sequence validation |

## Server → client

| Event | Purpose |
|---|---|
| `room:snapshot` | Complete lobby/score/settings state |
| `chat:message` | New sanitized chat message |
| `emoji:show` | Temporary reaction over a player |
| `tank:snapshot` | Authoritative game state |
| `tank:event` | Shot, hit, elimination, or victory visual cue |
| `server:error` | Human-readable rejected action |

## Tick and snapshot model

- Simulation: 30 Hz fixed timestep.
- Snapshot broadcast: 20 Hz.
- Client input send: 20 Hz and immediately on fire/aim interaction.
- A sequence number prevents older input packets from replacing newer state.

## Reconnection

The player ID is generated in the browser and retained in `localStorage`. Rejoining the same room code with that ID replaces the old socket binding. Disconnected players remain reserved briefly, then are removed and host authority is transferred to the next connected active player.
