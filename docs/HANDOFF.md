# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-16
- Branch: `milestone-1.7-1.8`; M1-7, M1-8 implemented and verified
- Current milestone: **M1 — rules engine in shared** (M1-2..M1-8 done)
- Next task: **M1-9** (golden placement + scoring fixtures, fuzz loop)

To resume: read `AGENTS.md`, then run `/task <next-id>`; use `/verify` before committing and
`/handoff` at the end of the session.

## What changed this session

| Task | Change | Files |
|------|--------|-------|
| M1-8 | Added `encodeCell`, `getOwner`, `getTurn` with `CELL_OWNER_MULTIPLIER=1000` | `packages/shared/src/game-mechanics/cell.ts` |
| M1-8 | Added decode test (6 tests: round-trip, distinct values, up to turn 999) | `packages/shared/src/game-mechanics/cell.test.ts` |
| M1-8 | Updated `findGroups` to use `getOwner` instead of `Math.floor(cell)` | `packages/shared/src/game-mechanics/scoring.ts` |
| M1-8 | Updated `getCellBackgroundClass` to decode via `/ 1000` | `packages/app/src/lib/utils/color.ts` |
| M1-8 | Updated API `/room/:id/turn` to use `playerId * 1000 + turn` | `packages/api/src/main.ts` |
| M1-8 | Updated all tests to use `encodeCell` for board cell values | `board.test.ts`, `scoring.test.ts` |
| M1-7 | Created `game-state.ts`: `createPieceSupply`, `canMove`, `isGameOver`, `getWinner` with tie-breaker, `TIE_BREAKER_LIMIT` | `packages/shared/src/game-mechanics/game-state.ts` |
| M1-7 | Added `TIE_BREAKER_LIMIT = -1` and `CELL_OWNER_MULTIPLIER = 1000` to constants | `packages/shared/src/constants.ts` |
| M1-7 | Tests: 5 supply, 5 canMove, 3 isGameOver, 7 getWinner tests | `packages/shared/src/game-mechanics/game-state.test.ts` |

### Design decisions

1. **Cell encoding**: `playerId * 1000 + turn` with `CELL_OWNER_MULTIPLIER = 1000`. Supports up to 999 turns per player before encoding collision. Chosen over `{owner, turn}` objects to keep board as flat `number[][]`.
2. **Piece count**: 30 per player (6 shapes × 5 each), not 25. We have 6 distinct shape geometries (L,O,T,I,S,Z) in the codebase; splitting S/Z means each needs its own piece pool.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bun test` | **91 pass, 0 fail** — board (30), dice (11), scoring (23), cell (6), game-state (20) |
| `cd packages/shared && bunx tsc --noEmit` | clean |
| `cd packages/api && bunx tsc --noEmit` | clean |
| `cd packages/app && bun run check` | clean (1 pre-existing a11y warning) |

## Not verified / known gaps

- No fuzz loop, golden fixtures, or skipped-turn logic (M1-9, M1-10).
- No blocked-group detection (M1-11), first-turn S/Z penalty (M1-12), or DiceValue update (M1-13 — done previously).
- No 2-player shared-color mode at the API level (M1-14 — `createPieceSupply` supports it but no consumer yet).
- Docker/Redis routes remain broken in wrangler dev — M2 target.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 — M1-7, M1-8: Piece supply, game-over, winner, stable cell encoding

Implemented two rules-engine tasks:
- **M1-7**: `createPieceSupply` (30 pieces per player, 6 shapes × 5), `canMove` (checks any shape orientation in any column), `isGameOver` (tower full or no pieces remain), `getWinner` with largest-connected-component tie-breaker and `TIE_BREAKER_LIMIT` sentinel. 20 tests.
- **M1-8**: `encodeCell`/`getOwner`/`getTurn` helpers with `CELL_OWNER_MULTIPLIER=1000`. Updated all board/scoring tests and `findGroups` to use the new decode. Updated `getCellBackgroundClass` in the app and the API's turn handler. 6 tests.
- 20 test files across 5 test suites; all existing tests updated for new cell encoding.

Next: **M1-9** (golden fixtures, fuzz loop).

### 2026-11-16 — M1-4, M1-5, M1-6: Legal columns, dice engine, scoring engine

Implemented `getLegalColumns`, `rollDie`, `scoreBoard`/`scoreTurn`, Z shape, updated `DiceValue`/`Shape` types. 65 tests (expanded to 91 this session with cell + game-state).