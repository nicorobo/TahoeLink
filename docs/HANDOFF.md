# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-16
- Branch: `main`; M1-2 and M1-3 implemented and verified
- Current milestone: **M1 — rules engine started** (M1-2, M1-3 done)
- Next task: **M1-4** (legal columns)

To resume: read `AGENTS.md`, then run `/task <next-id>`; use `/verify` before committing and
`/handoff` at the end of the session.

## What changed last session

| Task | Change | Files |
|------|--------|-------|
| M1-2 | Added `tryPlacePiece` with bounds, occupied, and ceiling-overflow checks | `packages/shared/src/game-mechanics/board.ts` |
| M1-3 | Refactored `getUpdatedBoard` as a thin throwing wrapper around `tryPlacePiece` | `packages/shared/src/game-mechanics/board.ts` |
| M1-2/3 | Tests: 23 golden tests covering all rejection cases, gravity stacking, edge cases | `packages/shared/src/game-mechanics/board.test.ts` |

### Design decisions

1. **`tryPlacePiece` accepts `shapeId`** — needed because `getUpdatedBoard` already passes it
   and the board needs a value to write. The PLAN omitted it from the sketch but it is
   required for the refactoring contract.
2. **Occupied-cell check is defense-in-depth** — mathematically unreachable for contiguous
   board states with the gravity algorithm (the piece always lands above all obstructions).
   Kept as a safety invariant for corrupted states. Documented in decisions log.
3. **`getUpdatedBoard` now throws** on invalid input instead of silently corrupting the
   board. This is an intentional hardening; the existing API caller (`main.ts:113`) validates
   before calling, but previously got garbage on overflow/overlap.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bun test` | **23 pass, 0 fail** — all placement and gravity tests |
| `bunx tsc --noEmit` (shared) | clean |
| `bunx tsc --noEmit` (api) | clean |
| `bun run check` (app) | **0 errors**, 1 pre-existing a11y warning |

## Not verified / known gaps

- No server-side integration test of `tryPlacePiece` via the API (needs M2 DO or Redis).
  The `turn` route at `main.ts:113` still uses `getUpdatedBoard` directly and is not tested
  here.
- No fuzz loop (planned for M1-9).
- Docker/REDIS routes are still broken in wrangler dev (same as last handoff — M2 target).

## Open questions

- None specific to M1-2/3.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 — M1-2 and M1-3: Safe placement + refactored gravity

Implemented `tryPlacePiece` with full validation (bounds, occupied cells, ceiling overflow)
and refactored `getUpdatedBoard` to delegate to it. 23 tests cover:
- Basic placement for every tetromino (I, O, S, T, L)
- Gravity stacking and uneven terrain
- All rejection cases: negative column, right-edge overflow, full-tower, ceiling overflow,
  partial ceiling overflow
- Immutability of the original board
- Deterministic cell order
- `getUpdatedBoard` preserving correct gravity and throwing on invalid input

Key discovery: the gravity algorithm makes occupied-cell conflicts unreachable for
contiguous board states. The safety check is kept as defense-in-depth.

Next: **M1-4** — `getLegalColumns(board, shape): number[]` for the UI and server.
