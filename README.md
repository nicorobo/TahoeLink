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
| API        | Bun, Hono 4, Zod, Server-Sent Events (SSE)                                 |
| State      | Redis 7 (room hash, player-slot keys, player list)                         |
| Local edge | nginx (TLS termination, `/api` reverse proxy, buffering disabled for SSE)  |
| Shared     | `@tahoelink/shared` — types, wire events, board/shape engine (no runtime deps) |

## How it fits together

```
Browser (SvelteKit + Tailwind)
  │
  ├── POST/GET /api/* ────────────────► nginx ──► Hono API (Bun) ──► Redis
  │                                                  │
  └── EventSource /api/sse/room/:id ────────────────►┘
```

- The browser talks only to the same origin. nginx serves the SvelteKit dev server and
  proxies `/api/*` to the API, stripping the `/api` prefix.
- Identity is a `session_id` httpOnly cookie set by the API.
- Room state and seat assignments live in Redis. Live updates are pushed over SSE.
- `@tahoelink/shared` is imported as TypeScript source (`"main": "src/index.ts"`), so it
  needs no build step. It must stay free of DOM, Bun, Redis, and framework imports.

## Repository layout

```
packages/
  app/      SvelteKit frontend
    src/lib/api.ts              API client (no response/error handling yet)
    src/lib/state.svelte.ts     client-side $state stores (room, player, piece)
    src/lib/events/             SSE event handlers
    src/lib/components/         Board, PieceDisplay, PieceControl, lobby components
    src/routes/                 landing page + /room/[roomId]
  api/      Bun + Hono server
    src/main.ts                 routes: create/join/leave/start/turn/get-room/SSE
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
- Docker Desktop / OrbStack (for the recommended path)
- `mkcert` (installed automatically by `make certs` on macOS via Homebrew)

Install workspace dependencies once from the repository root:

```bash
bun install
```

### Option A — Docker Compose (recommended, matches production topology)

```bash
make certs                 # generates localhost.crt / localhost.key (gitignored)
docker compose up --build
```

Open **https://localhost**.

- HTTPS is required: the session cookie is `Secure`, and SSE runs through the same origin.
- `http://localhost` redirects to `https://localhost`.
- API health: `curl -k https://localhost/api/health` → `{"status":"ok",...}`
- Ports: nginx `80`/`443`, app `5173`, API `3000`, Redis `6379`.
- Live file sync: `docker compose watch` (instead of `up`), or rebuild after dependency
  changes.
- Reset all rooms: `docker compose down -v`.

> `packages/app/README.Docker.md` is stale (it mentions port 3001). Ignore it.

**Verification status:** the Compose path is the intended workflow but was not executed on
the current machine because Docker is not installed. The native path below was partly
verified (see the table).

### Option B — Native Bun + Redis (not yet working end-to-end)

```bash
# Terminal 1: Redis
brew install redis
redis-server

# Terminal 2: API
cd packages/api
REDIS_HOST=localhost bun src/main.ts      # http://localhost:3000

# Terminal 3: web
cd packages/app
bun run dev                               # http://localhost:5173
```

This path is currently broken in three specific ways (all tracked as **M0** tasks in
[PLAN.md](./PLAN.md)):

1. `packages/app/src/lib/api.ts` hardcodes `/api` in the browser and `http://api:3000` on
   the server. Vite has no `/api` proxy, so browser API calls 404, and SSR of
   `/room/[roomId]` fails with `fetch failed` outside Docker.
2. The session cookie is always `Secure`; persistence over plain `http://localhost` is
   browser-dependent and unreliable.
3. `REDIS_HOST` defaults to the Docker hostname `redis`.

Once M0 is done, this path will work without Docker or TLS.

## Verified baseline

Checked on 2026-11-13 with Bun 1.4.4 on macOS:

| Check                                   | Result                                                        |
| --------------------------------------- | ------------------------------------------------------------- |
| `bun src/main.ts` (API)                 | starts; `GET /health` returns 200                             |
| `bun run dev` (app)                     | serves `/` with 200                                           |
| `GET /room/abc` via plain Vite          | **500** (`fetch failed` — SSR tries `http://api:3000`)        |
| `GET /api/health` via plain Vite        | **404** (no proxy)                                            |
| `cd packages/app && bun run check`      | **fails**: 4 type-only-import errors in `packages/shared`     |
| Tests                                   | none exist                                                    |
| Docker / Redis / mkcert on this machine | not installed                                                 |
| Session cookie over plain HTTP          | browser-dependent; use HTTPS (Compose) for reliable tests     |

## Configuration

| Variable          | Used by | Default   | Notes                                                         |
| ----------------- | ------- | --------- | ------------------------------------------------------------- |
| `PORT`            | API     | `3000`    |                                                               |
| `REDIS_HOST`      | API     | `redis`   | Docker service name. Use `localhost` for native dev.          |
| `REDIS_URL`       | —       | —         | Declared in `packages/api/.env.development` but not used yet. |
| `NODE_ENV`        | both    | —         | Set to `development` by Compose.                              |
| `PUBLIC_API_BASE` | web     | `/api`    | Planned (M0); browser API base.                               |
| `API_INTERNAL_URL` | web    | —         | Planned (M0); SSR API base. Alternative: disable SSR on `/room`. |
| `COOKIE_SECURE`   | API     | auto      | Planned (M0); derive from `X-Forwarded-Proto` or env.         |

## Common commands

```bash
bun install                              # workspace install (root only)
make certs                               # local TLS certs for nginx
docker compose up --build                # full stack
docker compose watch                     # full stack + file sync
docker compose down -v                   # stop and delete Redis data

cd packages/app && bun run dev           # SvelteKit dev server only
cd packages/app && bun run check         # svelte-check + TypeScript (currently fails)
cd packages/app && bun run build         # production build
cd packages/api && bun src/main.ts       # API only (needs Redis)
cd packages/shared && bunx tsc --noEmit -p tsconfig.json
cd packages/shared && bun test           # once tests exist
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
