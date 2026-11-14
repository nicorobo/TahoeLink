# TahoeLink

A multiplayer browser game based on the board game **Tetris Link**: 2–4 players share a
10×10 board, take turns dropping tetromino pieces into columns, and score by linking
pieces of their own color.

> **Status: pre-alpha — not playable yet.**
> You can create a room, claim a seat, and see other players join. Turns, dice, scoring,
> win conditions, and the game screen are not implemented. See [PLAN.md](./PLAN.md) for
> the exact gap list and roadmap.

| Area | State |
| ---- | ----- |
| Room creation, seat selection, join/leave in the lobby | Works |
| Start game | API endpoint only; no min-player check and no UI button |
| Turn ownership, dice roll, shape-vs-roll validation | Missing |
| Board drop/gravity | Works for in-bounds moves; crashes or loses pieces on overflow |
| Scoring, piece supply, end condition, winner | Missing |
| Game screen | Placeholder `<div>`; board/piece components exist but are unused |
| Realtime (SSE) | Basic broadcast only; no heartbeat, snapshot, or reconnect resync |
| Tests, CI, deployment | None yet (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)) |

## Stack

| Layer      | Technology                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| Web        | SvelteKit 2, Svelte 5 runes, Tailwind CSS 4, Vite 7                        |
| API        | Hono 4 + Zod, wrangler dev (Cloudflare Workers / Durable Objects target)   |
| Shared     | `@tahoelink/shared` — types, wire events, board/shape engine (no runtime deps) |

## Repository layout

```
packages/
  app/      SvelteKit frontend
    src/lib/api.ts              API client (no response/error handling yet)
    src/lib/state.svelte.ts     client-side $state stores (room, player, piece)
    src/lib/events/             SSE event handlers
    src/lib/components/         Board, PieceDisplay, PieceControl, lobby components
    src/routes/                 landing page + /room/[roomId]
  api/      Hono server (Workers-compatible)
    src/main.ts                 routes: create/join/leave/start/turn/get-room/SSE
    src/index.ts                Workers entry point
    src/models/                 Redis persistence for rooms and players
    src/broadcasting/           in-process SSE client registry + broadcasts
    src/middleware/             session cookie, SSE headers
    player-flow.txt             original lobby/game-flow notes (still relevant)
    data-model.txt              original data-model notes
  shared/   Pure TypeScript domain package
    src/types.ts                Board, Shape, DiceValue, Room
    src/constants.ts            board size, min/max players
    src/events.ts               typed SSE event payloads
    src/game-mechanics/         shapes, rotations/flips, board-drop math
```

## Run locally

### Prerequisites

- [Bun](https://bun.sh) 1.4+ (`bun --version`)
- Node.js (for `svelte-check` and other npm-based tooling)

Install workspace dependencies once from the repository root:

```bash
bun install
```

### Wrangler dev (recommended, no Docker/Redis)

```bash
# Terminal 1: API via wrangler dev (simulates Workers environment)
cd packages/api && bunx wrangler dev

# Terminal 2: SvelteKit dev server
cd packages/app && bun run dev
```

- UI: **http://localhost:5173**
- API health: `curl -s http://localhost:3000/health`
- Vite proxies `/api/*` to the wrangler dev server (`http://localhost:3000`)
- Room route uses `ssr = false`, so all API calls go through the browser via the proxy

Or use the concurrently shortcut from the root:

```bash
bun run dev:api   # just the API
bun run dev:web   # just the web app
bun run dev       # both (requires `bun install` at root for concurrently)
```

### Docker Compose (legacy, being phased out)

The old Docker Compose stack (nginx + Redis + Bun) still exists but is no longer the
recommended dev path. See `docker-compose.yml` and `Makefile` if you need it.

## Configuration

| Variable          | Used by | Default   | Notes                                                         |
| ----------------- | ------- | --------- | ------------------------------------------------------------- |
| `PORT`            | API     | `3000`    |                                                               |
| `REDIS_HOST`      | API     | `redis`   | Docker service name. Use `localhost` for native dev.          |
| `COOKIE_SECURE`   | API     | auto      | Derived from `X-Forwarded-Proto`; set `false` for plain HTTP  |
| `PUBLIC_API_BASE` | web     | `/api`    | Override for split deployments                                |

## Common commands

```bash
bun install                              # workspace install (root only)

cd packages/api && bunx wrangler dev     # API (Workers-compatible)
cd packages/app && bun run dev           # SvelteKit dev server
cd packages/app && bun run check         # svelte-check + TypeScript
cd packages/app && bun run build         # production build
cd packages/shared && bun test           # run engine tests
cd packages/shared && bunx tsc --noEmit  # typecheck shared
cd packages/api && bunx tsc --noEmit     # typecheck API
```

## Documentation

- [AGENTS.md](./AGENTS.md) — lean operating manual for coding agents
- [PLAN.md](./PLAN.md) — roadmap, rules contract, defect backlog, task queue
- [docs/HANDOFF.md](./docs/HANDOFF.md) — current state, last verified evidence, next task
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) — Cloudflare deployment options and migration plan
- [.pi/skills/tahoe-verify/SKILL.md](./.pi/skills/tahoe-verify/SKILL.md) — verification playbook
- [.pi/prompts/](./.pi/prompts/) — `/task`, `/verify`, `/handoff` agent commands

## Game rules

The implementation currently covers the board, five tetrominoes, four rotations, mirroring,
and vertical drop. The **scoring, piece supply, and end-of-game rules are not written down
anywhere in the repo** and must be confirmed from the rulebook before they can be coded.
See [PLAN.md § Rules contract](./PLAN.md#rules-contract).
