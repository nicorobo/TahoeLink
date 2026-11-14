# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-14 (session 6)
- Branch: `milestone-3.3-3.6-join-start-turn-leave`; M3-3 through M3-6 implemented and verified
- Current milestone: **M3 complete** — next is **M4** (complete the UI)

To resume: read `AGENTS.md`, then run `/task M4-1` (app shell) or another M4 task;
use `/verify` before committing and `/handoff` at the end of the session.

## What changed this session

| Task | Change | Files |
|------|--------|-------|
| M3-3 | Join rules: stage check allows `paused` (for rejoin after pause), spectator mode (WS without seat), MAX_PLAYERS enforced, structured 4xx | `packages/api/src/durable-objects/room-do.ts` (handleJoin) |
| M3-4 | Start game: rolls die, creates piece supply, initialises scores/scoredCells, applies first-turn S/Z penalty (−1 for starting player who rolls SZ on turn 1), broadcasts `state` event | `packages/api/src/durable-objects/room-do.ts` (handleStart) |
| M3-5 | Turn handling: validates active player/shape-vs-roll/piece supply, places piece via `tryPlacePiece`, scores via `scoreTurn`, decrements supply, advances turn, skips stuck players, detects game over via `isGameOver`+`getWinner`, broadcasts `state`+`game-over` | `packages/api/src/durable-objects/room-do.ts` (handleTurn) |
| M3-6 | Leave mid-game: frees seat, sets `paused`, reassigns active player, WebSocket close auto-leaves. Rejoin allowed during `paused`. | `packages/api/src/durable-objects/room-do.ts` (handleLeave, webSocketClose) |
| Wire | Added `'paused'` to `RoomStage` in shared types; added `'game-over'` event + handler in app; added `scoredCells` to DO state; added `winner` to GET room response | `shared/src/types.ts`, `shared/src/events.ts`, `app/src/lib/events/index.ts`, `room-do.ts` |
| Fix | Turn route Zod schema missing `'Z'` shape (SZ die face → player may play Z); added `rotation`/`column` validation | `packages/api/src/main.ts` |

### Design decisions

1. **Player ID convention**: Engine functions (`createPieceSupply`, `scoreTurn`, etc.) use 1‑based player IDs. DO stores `scores`/`scoredCells`/`piecesRemaining` with 1‑based keys. Seat indices (0–3) map to player IDs via `+1/−1` at the engine boundary.
2. **Paused state allows HTTP join**: Players who disconnected mid‑game can rejoin via HTTP. Same session gets idempotent rejoin; new session takes the freed seat.
3. **First‑turn S/Z penalty**: Applied as a flat −1 to the starting player's score at game start if `detectFirstTurnSZO` returns true. The actual empty‑space penalty during placement scoring is handled normally by `scoreTurn` on the first placement.
4. **Scored cells tracked per player**: `state.scoredCells: Record<string, string[]>` stores `"x,y"` keys of scored cells per player, fed back into `scoreTurn` as `previousScores` to avoid double‑counting on subsequent turns.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bunx tsc --noEmit` | clean |
| `cd packages/api && bunx tsc --noEmit` | clean |
| `cd packages/app && bun run check` | 0 errors, 1 pre-existing a11y warning |
| `cd packages/shared && bun test` | **182 pass, 0 fail** |
| `cd packages/api && bun test` | **19 pass, 0 fail** (needs wrangler dev on :8787) |
| Manual curl flow: create → join×2 → start → turn (any roll → legal shape) → leave → paused | All JSON responses correct; piece placed at correct board cells; scores computed (`{"1":4,"2":0}`); winner `null`; stage `paused` after leave |

## Current state

- **M3 complete**: Full join rules (M3-3), start game with die roll/supply/scoring/SZ penalty (M3-4), turn handling with placement/validation/advance/skip/game-over (M3-5), leave/pause/rejoin (M3-6).
- **All 19 API tests pass**, shared 182 tests pass, app typechecks clean.
- **Wire changes**: `RoomStage` includes `'paused'`; `'game-over'` event type added; GET room returns `scores`+`winner`; WS broadcasts `state`/`game-over` events.

## Not verified / known gaps

- **DO alarm handler** cannot be tested locally via HTTP — needs manual verification or a shorter TTL for testing (unchanged from M3-2).
- **WebSocket full lifecycle** not tested with two concurrent connections (browser or CLI level). Spectator mode (WS without seat) is untested — no browser code reads `playerId: null` gracefully yet (M4 task).
- **WebSocket close auto-leave** tested only via disconnection after the test suite; the test suite does not force a close mid-game to verify pause/rejoin.
- **Multiple skip-turn scenario** not explicitly tested — only normal advancement is exercised by the happy-path test.
- **Game over detection** not tested end-to-end — would need many turns to fill the board.
- **No 3–4 player test** — only 2-player path verified.
- **Client-side handlers** for `state` and `game-over` events are stubs (log only); proper UI handling is M4.
- **No browser-level E2E** Playwright flow exists yet.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 (session 6) — M3-3..M3-6: join, start, turn, leave/pause/rejoin

**M3-3** — Full join rules:
- handleJoin: allows `waiting-for-players` and `paused` stages; explicit MAX_PLAYERS via seats array length; idempotent rejoin; spectator mode (any WS client connects without HTTP join); structured 4xx error codes.

**M3-4** — Start game:
- handleStart: rolls die (`rollDie()`), stores roll in state; creates piece supply via `createPieceSupply(playerCount)` → maps seat index + 1; initialises flat scores + scored cells per player; sets join-order first player; first-turn S/Z penalty via `detectFirstTurnSZO` → applies −1 if true; broadcasts `state` event.

**M3-5** — Turn handling:
- handleTurn: validates active player, shape vs roll (`legalShapesForDie`), piece supply; gets orientation via `getShape({ shape, rotation, flip })`; places via `tryPlacePiece`; decrements supply; scores via `scoreTurn` (reconstructs PlayerScore from stored scores/scoredCells); detects game over (`isGameOver` + `getWinner`); advances turn with skip-turn loop (advances past players who can't move, MAX_PLAYERS guard); broadcasts `state` + `game-over`.

**M3-6** — Leave/pause/resume:
- handleLeave: frees seat; if `in-progress` → sets `paused`, reassigns activePlayerId to first remaining occupied seat (or null); broadcasts `player-left` + `state`.
- webSocketClose: auto-leaves on WS disconnect if the session has a seat in an `in-progress` game.
- handleJoin: allows join during `paused` (same session → idempotent; new session → takes freed seat).

**Wire updates:**
- `packages/shared/src/types.ts`: added `'paused'` to `RoomStage`
- `packages/shared/src/events.ts`: added `GameOverPayload` + `'game-over'` to `EventPayloadMap`
- `packages/api/src/main.ts`: added `'Z'` to ShapeSchema; added rotation/column validation to turn route
- `packages/app/src/lib/events/index.ts`: added `'game-over'` and `'state'` handler updates

**Tests:** All 19 API tests pass, shared 182 tests pass, app check clean (0 errors, 1 pre-existing a11y warning). Manual curl flow verified: create → join×2 → start → turn → leave → paused.

Next: **M4** (complete the UI) — start with M4-1 (app shell) or M4-3 (compose game screen).