# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-16
- Branch: `milestone-1.4-1.6`; M1-4, M1-5, M1-6 implemented and verified
- Current milestone: **M1 — rules engine in shared** (M1-2, M1-3, M1-4, M1-5, M1-6 done)
- Next task: **M1-7** (piece supply, game-over, winner)

To resume: read `AGENTS.md`, then run `/task <next-id>`; use `/verify` before committing and
`/handoff` at the end of the session.

## What changed last session

| Task | Change | Files |
|------|--------|-------|
| M1-4 | Added `getLegalColumns(board, shape): number[]` — iterates all columns and returns valid ones | `packages/shared/src/game-mechanics/board.ts` (+23 lines) |
| M1-4 | Tests: empty board, full tower, blocked columns, partial fill | `packages/shared/src/game-mechanics/board.test.ts` (+57 lines) |
| M1-5 | Added Z shape geometry (mirror of S); updated shapes export | `packages/shared/src/game-mechanics/shapes.ts` |
| M1-5 | Updated `Shape` type to include `'Z'`; `DiceValue` changed to `'I'\|'O'\|'T'\|'L'\|'SZ'\|'any'` | `packages/shared/src/types.ts` |
| M1-5 | Created `dice.ts`: `rollDie` (injectable RNG), `DICE_FACES`, `legalShapesForDie` mapping (SZ→[S,Z], any→all 6) | `packages/shared/src/game-mechanics/dice.ts` |
| M1-5 | Tests: DICE_FACES, mapping, injectable RNG, deterministic/cycling/default | `packages/shared/src/game-mechanics/dice.test.ts` |
| M1-6 | Created `scoring.ts`: `scoreBoard` (full recompute with `PlayerScore` tracking), `scoreTurn` (link scoring + empty-space penalty, delta calculation) | `packages/shared/src/game-mechanics/scoring.ts` |
| M1-6 | Tests: 23 tests — empty/no-score/3+/4+/multi-group, merge scenarios, diagonal/orthogonal, gap penalties, combined delta, previous-scores preservation | `packages/shared/src/game-mechanics/scoring.test.ts` |
| M1-5/6 | Updated shared index exports | `packages/shared/src/index.ts` |

### Design decisions

1. **`DiceValue` vs `Shape` separation**: `Shape` (`'L'|'O'|'T'|'I'|'S'|'Z'`) covers all 6 geometric shapes. `DiceValue` (`'I'|'O'|'T'|'L'|'SZ'|'any'`) covers the 6 die faces. `legalShapesForDie` maps between them.
2. **Scoring model**: `PlayerScore` wraps `{ score, scoredCells: string[] }` where `scoredCells` stores `"x,y"` keys. The no-piece-twice invariant is enforced by comparing against `scoredCells` before awarding points. `scoreBoard` recomputes from scratch given previous state; `scoreTurn` computes delta + empty-space penalty.
3. **Gap detection**: checks `board[px][py+1] < 0` for each placed cell. Penalty is per-unique-gap-column (not per cell): 1 gap → −1, 2+ → −2.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bun test` | **65 pass, 0 fail** — board (30), dice (11), scoring (24) |
| `bunx tsc --noEmit` (shared) | clean |
| `bunx tsc --noEmit` (api) | clean |
| `bun run check` (app) | clean (1 pre-existing a11y warning) |

## Not verified / known gaps

- No fuzz loop (planned for M1-9).
- Docker/Redis routes remain broken in wrangler dev — M2 target.
- The `DiceValue` type change (`'SZ'` instead of `'S'`) affects `packages/api/src/models/room.ts:27` which casts `as DiceValue`. Existing Redis data uses old values (`'S'`), but this is a stopgap until M2 replaces Redis with Durable Objects.
- Three P1 tasks remain unchecked: M1-7, M1-8, M1-9, M1-10, M1-11, M1-12, M1-13, M1-14.

## Open questions

- None specific to M1-4/5/6.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 — M1-4, M1-5, M1-6: Legal columns, dice engine, scoring engine

Implemented three rules-engine tasks:
- **M1-4**: `getLegalColumns` iterates all 10 columns and returns those where `tryPlacePiece` succeeds. 7 tests.
- **M1-5**: Added Z shape (mirror of S), updated `DiceValue` to 6 die-face members, `rollDie` with injectable RNG, `legalShapesForDie` mapping. 11 tests.
- **M1-6**: `scoreBoard` finds connected components via BFS flood-fill, scores cells in 3+ groups (no-piece-twice via `scoredCells` tracking). `scoreTurn` wraps `scoreBoard` + empty-space penalty (−1/column, max −2). 23 tests.
- Z shape was confirmed by mirroring S's rotations: `Z = [[s01,s11,s10], [s110,s011]]`.

Next: **M1-7** (piece supply, game-over detection, winner with tie-breaker).

### 2026-11-16 — M1-2 and M1-3: Safe placement + refactored gravity

Implemented `tryPlacePiece` with full validation (bounds, occupied cells, ceiling overflow) and refactored `getUpdatedBoard` to delegate to it. 23 tests.