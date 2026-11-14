# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-16
- Branch: `milestone-1.9`; M1-9 implemented and verified
- Current milestone: **M1 — rules engine in shared** (M1-2..M1-9 done)
- Next task: **M1-10** (skip-turn logic)

To resume: read `AGENTS.md`, then run `/task <next-id>`; use `/verify` before committing and
`/handoff` at the end of the session.

## What changed this session

| Task | Change | Files |
|------|--------|-------|
| M1-9 | Added golden placement fixtures for every shape (L,O,T,I,S,Z) at left wall, right wall, stacked, and ceiling overflow — 38 tests | `packages/shared/src/game-mechanics/board.test.ts` |
| M1-9 | Added merge-scoring fixtures (3-group merge, bridge merge preserving scored cells, complex multi-player) — 8 new tests | `packages/shared/src/game-mechanics/scoring.test.ts` |
| M1-9 | Added empty-space penalty edge cases (partial overhang, mixed terrain, multi-gap) — 3 new tests | `packages/shared/src/game-mechanics/scoring.test.ts` |
| M1-9 | Added seeded-dice distribution test (Park-Miller LCG, 6000 rolls) | `packages/shared/src/game-mechanics/dice.test.ts` |
| M1-9 | Added game-state edge cases (3-way tie-breaker, 4-player winner, single cell hole) — 7 new tests | `packages/shared/src/game-mechanics/game-state.test.ts` |
| M1-9 | Created seeded fuzz loop: 50 random 2-player games + 2/3/4-player single seeds with overlap/owner invariants, reproducibility | `packages/shared/src/game-mechanics/fuzz.test.ts` |

### Design decisions

1. **Park-Miller LCG** for seeded RNG in fuzz and dice tests. Simple 32-bit arithmetic avoids JS BigInt pitfalls with 64-bit LCGs.
2. **No blocked-group detection fixtures** in M1-9 — deferred to M1-11 when `getBlockedGroups` exists.
3. **`runRandomGame` uses an `anyMovesRemain` guard** to detect game-over rather than relying on attempt limits alone, ensuring fast termination on full boards.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bun test` | **153 pass, 0 fail** — board (66), dice (10), scoring (31), cell (6), game-state (31), fuzz (8) |
| `cd packages/shared && bunx tsc --noEmit` | clean |
| `cd packages/api && bunx tsc --noEmit` | clean |
| `cd packages/app && bun run check` | clean (1 pre-existing a11y warning) |
| 50 random 2-player fuzz games | all terminate, no overlaps, no owner errors |

## Not verified / known gaps

- No skipped-turn logic (M1-10).
- No blocked-group detection (M1-11).
- No first-turn S/Z penalty (M1-12).
- No DiceValue type update for combined S/Z face (M1-13 — partially done).
- No 2-player shared-color mode at the API level (M1-14).
- The fuzz loop does not verify floating-cell invariants (the gravity algorithm permits overhangs by design).
- Docker/Redis routes remain broken in wrangler dev — M2 target.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 — M1-9: Golden fixtures, scoring edge cases, fuzz loop

Implemented comprehensive test coverage for the rules engine:
- 38 golden placement fixtures across all 6 shapes (L,O,T,I,S,Z), each tested at left wall, right wall, stacked, and ceiling-overflow scenarios.
- 11 new scoring tests: 3-group merge, scored-to-unscored bridge, multi-player scoring, empty-space edge cases.
- 7 new game-state tests: 3-way and 4-player getWinner, tie-breaker edge cases, single-cell-hole detection.
- Dice distribution test with Park-Miller LCG and 6000 rolls.
- Fuzz loop with 50 random 2-player games and 4 single-seed games (2/3/4-player), all verifying overlap and owner invariants.
- 153 total tests, 0 failures across all files.
- Updated PLAN.md checkbox and HANDOFF.md.

Next: **M1-10** (skip-turn logic) or any of M1-11..M1-14 as preferred.

### 2026-11-16 — M1-7, M1-8: Piece supply, game-over, winner, stable cell encoding

Implemented two rules-engine tasks:
- **M1-7**: `createPieceSupply` (30 pieces per player, 6 shapes × 5), `canMove`, `isGameOver`, `getWinner` with tie-breaker.
- **M1-8**: `encodeCell`/`getOwner`/`getTurn` helpers with `CELL_OWNER_MULTIPLIER=1000`.

### 2026-11-16 — M1-4, M1-5, M1-6: Legal columns, dice engine, scoring engine