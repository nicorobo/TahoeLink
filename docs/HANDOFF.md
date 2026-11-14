# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-16 (session 4)
- Branch: `milestone-2.5-2.7`; M2-5, M2-6, M2-7 implemented and verified
- Current milestone: **M2 complete** — next is **M3 — Server state machine on DO**

To resume: read `AGENTS.md`, then run `/task M3-1` (standardize errors) or `/task M3-2`
(room lifecycle); use `/verify` before committing and `/handoff` at the end of the session.

## What changed this session

| Task | Change | Files |
|------|--------|-------|
| M2-5 | Updated `events.ts` for WebSocket payloads: added `state` and `error` types; removed `participant-change` (SSE-era). Updated event handlers in app. | `packages/shared/src/events.ts` (edited), `packages/app/src/lib/events/index.ts` (edited) |
| M2-5 | Fixed type mismatch in app from removed event type | `packages/app/src/lib/events/index.ts` |
| M2-6 | Created DO lifecycle tests (HTTP + WebSocket) — 16 tests covering create, join, start, turn, leave, rejoin idempotency, error cases, WS connect/state snapshot | `packages/api/src/__tests__/room-do.test.ts` (new) |
| M2-6 | Added test script to API package.json; removed `ioredis` dependency | `packages/api/package.json` |
| M2-7 | Updated README.md: removed Redis/Docker/SSE references, updated repo layout, status table, commands | `README.md` |
| M2-7 | Updated AGENTS.md: removed Docker/Redis references, updated architecture map, commands | `AGENTS.md` |
| M2-7 | Rewrote smoke.sh for DO-only workflow (no Redis branches) | `scripts/smoke.sh` |
| M2-7 | Updated tahoe-verify skill: removed Docker/Redis inspection sections | `.pi/skills/tahoe-verify/SKILL.md` |
| M2-7 | Cleaned up env files (removed REDIS_HOST/REDIS_URL) | `packages/api/.env.example`, `.env.development` |
| M2-7 | Deleted Dockerfiles and Makefile (no longer needed) | `packages/app/Dockerfile`, `packages/api/Dockerfile`, `Makefile` |
| M2-7 | Removed deprecated files from git tracking | — |
| M2-7 | Added `test:api` script to root package.json | `package.json` |

### Design decisions

1. **DO tests via HTTP** (not `SELF.fetch()`): Used Bun HTTP requests against `wrangler dev` instead of miniflare `SELF.fetch()` because (a) miniflare 4 has no standalone API, (b) wrangler dev is the standard dev workflow, (c) the tests also serve as integration tests validating the full HTTP route → DO stub → DO handler chain. Tests require wrangler dev running on port 8787.
2. **Cookie-based session for tests**: Tests use the actual session cookie middleware, not `X-Session-Id` headers. The `req()` helper extracts `Set-Cookie` and passes it on subsequent requests, matching real browser behavior.
3. **Retained `player-flow.txt` and `data-model.txt`**: These are design notes that still have relevant context for future work, even though they reference the old Redis-based architecture.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bunx tsc --noEmit` | clean |
| `cd packages/api && bunx tsc --noEmit` | clean |
| `cd packages/app && bun run check` | 0 errors, 1 pre-existing a11y warning |
| `cd packages/shared && bun test` | **182 pass, 0 fail** |
| `cd packages/api && bun test` | **16 pass, 0 fail** (needs wrangler dev on :8787) |
| `POST /create-room` | 200, returns `{roomId}` |
| `POST /room/:id/join` ×2 | 200, different seats |
| `POST /room/:id/start` | 200, stage → `in-progress` |
| `POST /room/:id/turn` | 200, turn increments |
| `POST /room/:id/leave` | 200, player removed |
| Rejoin idempotency | Same session returns existing seat |
| WebSocket connect | 101 upgrade, receives `connected` + `state` events |

## Current state

- **DO foundation complete**: RoomDurableObject owns seats, board, stage, turn, roll, scores. WebSocket Hibernation API for real-time. All Redis models and SSE broadcasting deleted.
- **Events aligned**: `events.ts` has `connected`, `state`, `turn-start`, `player-joined`, `player-left`, `error` — matching what the DO broadcasts.
- **All docs cleaned up**: No Redis/Docker/SSE references remain in README, AGENTS.md, env files, smoke script, or verify skill.
- **No ioredis dependency**: Removed from API package.json.

## Not verified / known gaps

- **WebSocket full lifecycle** not tested with two concurrent connections — no browser-level test for broadcast fanout during join/leave.
- **No `MIN_PLAYERS` / `MAX_PLAYERS` enforcement** in DO start handler — M3-4 target.
- **Turn handler is a stub** — no board math, dice roll, scoring, or active-player validation. Full turn enforcement in M3-5.
- **No game UI** — board/piece components exist but are unused (M4 target).
- **`smoke.sh`** was rewritten but not tested against a running wrangler dev in this session. Run it in the next session.
- macOS has no `timeout` command; use `perl -e 'alarm shift; exec @ARGV'`.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 (session 4) — M2-5..M2-7: Events, tests, documentation cleanup

**M2-5** — Refreshed `packages/shared/src/events.ts`:
- Added `StatePayload` (full room snapshot for WS `state` event)
- Added `ErrorPayload` for error events
- Removed `ParticipantChangePayload` (was SSE-era, never used by DO)
- Updated `EventPayloadMap` accordingly
- Fixed `packages/app/src/lib/events/index.ts` which referenced the removed `participant-change` type

**M2-6** — DO lifecycle tests:
- Created `packages/api/src/__tests__/room-do.test.ts` with 16 tests
- Tests exercise: create, read, join (2 players), rejoin idempotency, start, turn, leave, error cases (no-session join, unknown room), WebSocket connect and state snapshot
- All tests pass against `wrangler dev` on port 8787
- Added `"test": "bun test"` script to API package.json
- Removed `ioredis` from dependencies (no longer imported anywhere)

**M2-7** — Documentation and cleanup:
- Updated README.md: removed Docker/SSE/Redis references, updated status table, repo layout, configuration table, commands, game rules section
- Updated AGENTS.md: removed Docker commands, simplified probe/commands/probes, updated architecture map, date stamp, P0 landmines table
- Rewrote `scripts/smoke.sh`: removed Redis branching, uses cookies for session persistence
- Updated `.pi/skills/tahoe-verify/SKILL.md`: removed Docker path, Redis inspection, updated expected results
- Cleaned env files: removed `REDIS_HOST`/`REDIS_URL` from `.env.example` and `.env.development`
- Deleted Dockerfiles and Makefile (no longer needed for Wrangler-only dev)
- Added `test:api` script to root package.json

Next: **M3-1** (standardize errors) or **M3-2** (room lifecycle: crypto IDs, collision check, 404, TTL).
