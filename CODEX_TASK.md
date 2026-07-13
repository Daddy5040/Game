# Codex continuation brief

You are working inside the **Stickman Office Party** monorepo. Preserve the existing server-authoritative architecture and typed Socket.IO contracts.

## Validation in Codex Cloud

Do not depend on npm commands running inside Codex Cloud. Make the requested source changes, then commit or open a pull request. The workflow in `.github/workflows/build.yml` runs the `build` job on GitHub-hosted infrastructure and performs:

1. locked dependency installation;
2. TypeScript validation;
3. production compilation;
4. the two-player Socket.IO smoke test;
5. compiled artifact upload.

After every change, inspect **GitHub → Actions → Build**. When a check fails, use the failed step log as the source of truth and fix the code in a new commit.

## Current implementation

- React + TypeScript + TailwindCSS responsive frontend.
- Node.js + Express + Socket.IO backend.
- Built-in Node.js SQLite persistence.
- Private rooms, host controls, 2–8 active players, spectators, reconnect grace period.
- Lobby chat, ready state, mini-game voting, settings, emoji reactions.
- Server-authoritative Tank Battle at 30 simulation ticks/sec and 20 snapshots/sec.
- Desktop and mobile controls, particles, screen shake, scoreboards, multi-round party ranking.
- Docker and a Socket.IO smoke test.

## Next requested milestone

Implement **Football** as the second playable mini-game without breaking Tank Battle.

### Acceptance criteria

1. Extract a reusable mini-game adapter/lifecycle based on `docs/ROADMAP.md`.
2. Add server-authoritative circle/ball physics, goals, timer, and score.
3. Support 1v1, 2v2, and free-for-all based on active player count.
4. Add Football input/snapshot/event types to `@stickman/shared`.
5. Add a responsive Canvas renderer and mobile controls.
6. Let voting select Football once it is playable.
7. Persist Football results using the existing match tables.
8. Add deterministic unit tests for goals and collision impulses.
9. Extend the smoke test to start both Tank Battle and Football.
10. Keep bandwidth compact and never trust client-reported position, score, collision, or victory.

Do not replace Socket.IO, React, Tailwind, SQLite, or the monorepo layout unless a documented migration is explicitly requested.
