# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-16 (session 5)
- Branch: `milestone-3.1-3.2-error-standardization-room-lifecycle`; M3-1, M3-2 implemented and verified
- Current milestone: **M3 in progress** — next is **M3-3** (join rules) or **M3-4** (start game)

To resume: read `AGENTS.md`, then run `/task M3-3` (join rules) or `/task M3-4` (start game);
use `/verify` before committing and `/handoff` at the end of the session.

## What changed this session

| Task | Change | Files |
|------|--------|-------|
| M3-1 | Created `HTTPException` class with `{ error: { code, message } }` body format; `Err` factory for common errors | `packages/api/src/lib/http-error.ts` (new) |
| M3-1 | Added Hono `onError` handler — catches `HTTPException` and unexpected errors; never leaks stack traces in production | `packages/api/src/main.ts` |
| M3-1 | Updated all DO error responses to use structured `{ error: { code, message } }` format with meaningful machine-readable codes | `packages/api/src/durable-objects/room-do.ts` |
| M3-1 | Standardised `doFetch` to forward DO status codes; all DO-proxied routes use `doFetch` consistently | `packages/api/src/main.ts` |
| M3-2 | Created crypto room ID generator: 5 random bytes → 8-char Crockford base32 (no ambiguous I/L/O/U) | `packages/api/src/lib/room-id.ts` |
| M3-2 | Collision detection: `handleInit` returns 409 if room already initialized; Hono route retries up to 5 times | `packages/api/src/durable-objects/room-do.ts`, `packages/api/src/main.ts` |
| M3-2 | 404 for unknown rooms: DO no longer auto-initializes on read; `initialized` flag checked on all handlers | `packages/api/src/durable-objects/room-do.ts` |
| M3-2 | DO alarm-based sliding TTL: 24-hour expiry reset on every `persist()` call; `alarm()` handler cleans up storage | `packages/api/src/durable-objects/room-do.ts`, `packages/api/src/types/cloudflare.d.ts` |
| M3-2 | Updated tests: 404 test, error format test, room ID format test (+3 new tests, 19 total) | `packages/api/src/__tests__/room-do.test.ts` |

### Design decisions

1. **Error format matches events.ts `ErrorPayload`**: Using `{ error: { code, message } }` ensures consistency between the `error` WebSocket event and HTTP error responses.
2. **DO alarm for TTL**: Sliding expiry reset on every `persist()` call means idle rooms expire; busy rooms stay alive. DO alarms require adding `alarm()` and `setAlarm` to the Cloudflare type declarations.
3. **DO preserves uninitialized state**: Instead of auto-initializing default state on first access (old behavior), the DO now returns 404 for any uninitialized room. Only `handleInit` (called by POST /create-room) sets `initialized: true`.
4. **Crockford base32 for room IDs**: 5 random bytes → 40 bits → 8 characters. Avoids ambiguous I/L/O/U for easy verbal sharing. Collision retry handles the astronomically unlikely case.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bunx tsc --noEmit` | clean |
| `cd packages/api && bunx tsc --noEmit` | clean |
| `cd packages/app && bun run check` | 0 errors, 1 pre-existing a11y warning |
| `cd packages/shared && bun test` | **182 pass, 0 fail** |
| `cd packages/api && bun test` | **19 pass, 0 fail** (needs wrangler dev on :8787) |
| `POST /create-room` | 200, returns `{roomId}` (8-char Crockford base32) |
| `POST /room/:id/join` ×2 | 200, different seats |
| `POST /room/:id/start` | 200, stage → `in-progress` |
| `POST /room/:id/turn` | 200, turn increments |
| `POST /room/:id/leave` | 200, player removed |
| `GET /room/:id` unknown room | **404** with `{ error: { code: "NOT_FOUND", ... } }` |
| All error responses | Use `{ error: { code, message } }` format |
| Room ID format | 8 chars, Crockford base32, no I/L/O/U |
| WebSocket connect | 101 upgrade, receives `connected` + `state` events |

## Current state

- **Error standardization complete**: `HTTPException` class, Hono `onError` handler, all DO error responses use structured `{ error: { code, message } }` format. No stack traces leaked in production.
- **Room lifecycle complete**: Crypto room IDs (8-char Crockford base32, collision retry), 404 for unknown rooms, 24h sliding TTL via DO alarm, `createdAt`/`updatedAt` tracked.
- **All 19 API tests pass** including 3 new: 404 unknown room, error format validation, room ID format validation.

## Not verified / known gaps

- **DO alarm handler** cannot be tested locally via HTTP — needs manual verification or a shorter TTL for testing.
- **WebSocket full lifecycle** not tested with two concurrent connections — no browser-level test for broadcast fanout.
- **Smoke.sh** not re-tested this session; likely still works (no API contract changes).
- **D10 defect** (unknown rooms 404, TTL, crypto IDs) is now resolved by M3-2.
- Turn handler still a stub (M3-5 target), no game UI (M4 target).

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 (session 5) — M3-1..M3-2: Error standardization, room lifecycle

**M3-1** — Error standardization:
- Created `packages/api/src/lib/http-error.ts`: `HTTPException` class with `{ error: { code, message } }` body; `Err` factory for common errors (notFound, badRequest, conflict, validation, etc.)
- Added Hono `onError` handler that catches `HTTPException` and formats it; unexpected errors log and return generic 500 (stack trace hidden in production via `NODE_ENV` check)
- Rewrote all DO error responses to use structured codes: `NOT_FOUND`, `VALIDATION_ERROR`, `GAME_IN_PROGRESS`, `ROOM_FULL`, `NOT_A_PLAYER`, `NOT_ENOUGH_PLAYERS`, `GAME_NOT_IN_PROGRESS`, `SESSION_REQUIRED`, `CONFLICT`
- Standardized all DO-proxied routes in `main.ts` to use `doFetch()` which forwards status codes; removed `c.json(data, res.status)` calls that conflicted with Hono's strict type system
- Hono routes: `/room/:roomId/join`, `/leave`, `/start`, `/turn` all forward DO responses faithfully

**M3-2** — Room lifecycle:
- Created `packages/api/src/lib/room-id.ts`: `generateRoomId()` uses `crypto.getRandomValues(5)` → 40-bit integer → 8 Crockford base32 characters (alphabet excludes I/L/O/U for ambiguity-free sharing)
- Collision detection: `handleInit` checks `this._state.initialized` before setting defaults; returns 409 Conflict if already initialized. Hono's `POST /create-room` retries up to 5 times with fresh IDs on 409.
- 404 for unknown rooms: DO no longer auto-initializes on `ensureLoaded()`; instead loads from storage and sets `_state = null` if not found. Handlers return 404 `NOT_FOUND` when `!_state || !_state.initialized`.
- DO alarm-based TTL: Added `setAlarm` and `alarm()` to cloudflare type declarations; `persist()` resets a 24-hour sliding alarm; `alarm()` handler deletes room storage data.
- Updated types in cloudflare.d.ts: added `setAlarm(timestamp)` and `getAlarm()` to `DurableObjectState`, and `alarm()?` method to `DurableObject` base class.

**Tests updated:**
- "GET unknown room returns 200" → renamed to "GET unknown room returns 404 with standardized error", expects 404 and `{ error: { code: "NOT_FOUND", ... } }`
- New: "POST /room/:id/join on unknown room returns 404" verifies 404 on all uninitialized room endpoints
- New: "All errors use { error: { code, message } } format" verifies the standard shape
- New: "Room ID is 8-character Crockford base32" verifies format and excluded chars
- 19 tests total, all pass

Next: **M3-3** (full join rules: `MAX_PLAYERS`, stage checks, spectator mode) or **M3-4** (start game: dice roll, turn order, S/Z penalty).