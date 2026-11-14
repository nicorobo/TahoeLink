# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-16 (session 3)
- Branch: `milestone-2.1-2.4`; M2-1 through M2-4 implemented and verified
- Current milestone: **M2 — Durable Object foundation** (M2-1..M2-4 complete, M2-5..M2-7 next)

To resume: read `AGENTS.md`, then run `/task M2-5` (or `/task M2-7` for next task in M2);
use `/verify` before committing and `/handoff` at the end of the session.

## What changed this session

| Task | Change | Files |
|------|--------|-------|
| M2-1 | Created `RoomDurableObject` class managing seats/board/stage/turn/roll/scores via DO key-value storage. WebSocket Hibernation API for real-time broadcast. | `packages/api/src/durable-objects/room-do.ts` (new) |
| M2-2 | Wired DO into Hono routes: create-room → DO init, GET /room/:id → DO fetch, removed Redis models. | `packages/api/src/main.ts` (rewritten), removed `models/room.ts`, `redis.ts` |
| M2-3 | WebSocket upgrade at `/ws/room/:id` forwarding to DO Hibernation API. Removed SSE broadcasting. | `packages/api/src/main.ts` (ws route), removed `broadcasting/`, `middleware/sse.ts` |
| M2-4 | Join/leave handled by DO methods with seat array + broadcast. Removed players model. | `packages/api/src/durable-objects/room-do.ts`, removed `models/players.ts` |
| — | Updated Workers entry point to export DO class for wrangler binding. | `packages/api/src/index.ts` |
| — | Added DO binding + migration to wrangler config. | `packages/api/wrangler.jsonc` |
| — | Custom type declarations for `cloudflare:workers` module avoiding extra npm dependency. | `packages/api/src/types/cloudflare.d.ts` (new) |

### Old files deleted

- `packages/api/src/models/room.ts`, `packages/api/src/models/players.ts` — replaced by DO
- `packages/api/src/redis.ts` — no longer needed
- `packages/api/src/broadcasting/` (3 files) — replaced by WS
- `packages/api/src/middleware/sse.ts` — no longer needed

### Design decisions

1. **DO persistence**: Used key-value `storage.put/get` (not SQL API) for simpler migration from Redis-like API.
2. **State transport**: WebSocket `{event, data}` JSON envelopes via `ctx.getWebSockets()` broadcast.
3. **Type declarations**: Custom `cloudflare.d.ts` instead of `@cloudflare/workers-types` to avoid extra dependency. Declares `DurableObject`, `DurableObjectState`, `DurableObjectStorage`, `WebSocketPair`, `DurableObjectNamespace` types.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/api && bunx tsc --noEmit` | clean |
| `cd packages/shared && bunx tsc --noEmit` | clean |
| `cd packages/app && bun run check` | 0 errors, 1 pre-existing a11y warning |
| `cd packages/shared && bun test` | **182 pass, 0 fail** |
| `POST /create-room` on wrangler local dev | 200, returns `{roomId}` |
| `POST /room/:id/join` ×2 | 200, returns `{playerId, playerIds}` |
| `GET /room/:id` | 200, returns room + seats + playerPosition |
| `POST /room/:id/start` | 200, stage transitions to `in-progress` |
| `POST /room/:id/turn` | 200, turn increments |
| `POST /room/:id/leave` | 200, player removed from seat list |

## Not verified / known gaps

- **WebSocket full handshake** not tested — no `websocat` or browser client connected. The upgrade endpoint is wired, but we haven't verified the full WS lifecycle (connect → state snapshot → broadcast on join/leave). This should be tested in M2-5/M2-6 when event types are updated.
- **No API tests** — M2-6 (DO lifecycle tests with `SELF.fetch()`) still pending.
- **`MIN_PLAYERS` / `MAX_PLAYERS`** are defined in shared constants but not enforced in DO start handler — M3-4 target.
- **Turn handler is a stub** — no board math, dice roll, scoring, or active-player validation. Full turn enforcement in M3-5.
- **No `min-players` check on start** — DO start handler allows starting with any player count. M3-4 target.
- **Docker Compose** was already deleted in a prior session.
- **`smoke.sh`** script still references Redis-dependent routes — needs updating (M2-6 or M2-7).
- macOS has no `timeout` command; use `perl -e 'alarm shift; exec @ARGV'`.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 (session 3) — M2-1..M2-4: Durable Object foundation

Created the RoomDurableObject class replacing all Redis-based models and SSE broadcasting:

- **DO class** (`room-do.ts`): Manages room state (seats, board, stage, turn, roll, scores) via `ctx.storage`. Handles GET (room state), POST (join, leave, init, start, turn), and WebSocket upgrade. Uses Hibernation API for WS connections and `ctx.getWebSockets()` for broadcasting.
- **Hono routes** (`main.ts`): Rewritten to forward all room operations to the DO via `stub.fetch()`. Removed Redis/SSE dependencies. Routes for create, read, join, leave, start, turn, and WS upgrade all work end-to-end.
- **Entry point** (`index.ts`): Exports both the DO class (for wrangler binding) and the fetch handler.
- **Type declarations** (`cloudflare.d.ts`): Custom types for `cloudflare:workers` module and `DurableObjectNamespace` global.

All checks pass. All HTTP endpoints verified against running wrangler dev instance.

**Debugging note**: The DO `fetch()` dispatch must explicitly call out each path (`/start`, `/turn`) — it doesn't fall through from other POST paths. The initial write of the DO omitted the `/start` and `/turn` dispatch entries, causing 404 from the DO even after the Hono route correctly forwarded requests.

Next: **M2-5** (refresh events.ts), **M2-6** (DO lifecycle tests), or **M2-7** (documentation cleanup).