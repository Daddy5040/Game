# Stickman Office Party

A browser-based multiplayer party game for 2–8 office colleagues. The MVP includes private rooms, lobby chat, ready states, mini-game voting, persistent statistics, spectator support, emoji reactions, configurable room rules, and a server-authoritative **Tank Battle** mini-game.

## GitHub Actions for Codex Cloud

The repository includes a ready-to-use workflow at `.github/workflows/build.yml`. After Codex Cloud commits or opens a pull request, GitHub automatically runs the `build` job:

- installs locked dependencies on a GitHub-hosted runner;
- runs TypeScript validation;
- builds the frontend, server, and shared package;
- runs the two-player Socket.IO smoke test;
- publishes the compiled files as a downloadable Actions artifact.

No npm command is required inside Codex Cloud. See [`docs/GITHUB_ACTIONS.md`](docs/GITHUB_ACTIONS.md) for the GitHub UI workflow and branch-protection recommendation.

## Optional local start

Local commands are only needed when working on a computer with Node.js installed:

```bash
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:5173` in two or more browser windows, choose nicknames, create a room in one window, and join with the invite code in the others.

### Production

```bash
npm run build
npm start
```

The Express server serves the compiled React application on `http://localhost:3001`. Node.js 22.5+ is required because the server uses the built-in SQLite module.

### Docker

```bash
docker compose up --build
```

## Validation

```bash
npm run typecheck
npm run test:smoke
```

The smoke test launches a temporary server, connects two Socket.IO clients, creates and joins a room, marks both players ready, starts Tank Battle, and verifies the authoritative snapshot.

## Controls

- Desktop movement: `WASD` or arrow keys
- Aim: mouse pointer
- Fire: hold left click or `Space`
- Mobile: on-screen directional pad, aim pad, and fire button
- Emoji: buttons above the game canvas

## Architecture

- `apps/web`: React, TypeScript, TailwindCSS, HTML5 Canvas
- `apps/server`: Node.js, Express, Socket.IO, SQLite
- `packages/shared`: shared networking contracts and game-state types
- `docs`: architecture, network protocol, schema, UI mockups, and incremental roadmap

## MVP rules

- 2–8 active players per room; additional participants join as spectators while a match is running or when the room is full.
- The host starts a round after all active players are ready.
- Each tank has 100 HP. A shell deals 34 damage.
- Last tank alive wins. If time expires, the surviving tank with the most HP wins.
- A round winner receives 100 party points.

## Codex Cloud workflow

Open this folder as the Codex workspace. Codex should edit the source, commit the change, and rely on the GitHub Actions `build` job for installation, typechecking, compilation, and the multiplayer smoke test.

Suggested next tasks:

1. Implement the next mini-game behind the shared `MiniGameAdapter` contract described in `docs/ROADMAP.md`.
2. Add integration tests for Socket.IO room lifecycle and deterministic Tank Battle collision cases.
3. Commit or open a pull request and inspect **Actions → Build** on GitHub.
4. Fix any failed Action by using the relevant step log; no npm command needs to run in Codex Cloud.

## Continue with Codex

Use `CODEX_TASK.md` as the implementation brief for the next milestone.
