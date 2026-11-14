# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-16 (session 2)
- Branch: `milestone-1.10-1.12`; M1-10 through M1-14 implemented and verified
- Current milestone: **M1 — rules engine in shared** (all M1 tasks complete ✅)
- Next milestone: **M2 — Durable Object foundation** (M2-1 .. M2-7)

To resume: read `AGENTS.md`, then run `/task M2-1`; use `/verify` before committing and
`/handoff` at the end of the session.

## What changed this session

| Task | Change | Files |
|------|--------|-------|
| M1-10 | Added `trySkipTurn` — skips when no pieces remain or shape cannot fit in any orientation. Covers SZ (both S and Z checked) and any (all 6 shapes checked) die faces. 12 tests. | `packages/shared/src/game-mechanics/game-state.ts`, `game-state.test.ts` |
| M1-11 | Added `getBlockedGroups` — detects groups fully surrounded by opponents/board edge. Returns `Record<playerId, Set<string>[]>`. 10 tests including multi-player, mixed blocked/unblocked, edge-corner cases. | `packages/shared/src/game-mechanics/scoring.ts`, `scoring.test.ts` |
| M1-12 | Added `detectFirstTurnSZO` — returns true when board is empty and diceValue is `'SZ'`. 6 tests. | `packages/shared/src/game-mechanics/game-state.ts`, `game-state.test.ts` |
| M1-13 | Verified: `DiceValue` already has `'SZ'` member, `DICE_FACES` constant exists with 6 entries, `legalShapesForDie` maps correctly. No changes needed. | — (verified) |
| M1-14 | Verified: `createPieceSupply` already supports `sharedColor` parameter with shared-object semantics for 2-player mode. No changes needed. | — (verified) |

### Design decisions

1. **`trySkipTurn` uses `legalShapesForDie`** to resolve dice values to shape lists, ensuring SZ checks both S and Z. For `any`, all 6 shapes are checked; if any shape has pieces and fits, the turn is not skipped.
2. **`getBlockedGroups` uses `findGroups`** (existing BFS) then checks each group for empty orthogonal neighbors. A group is blocked only when *no* cell in the group has an empty neighbor within bounds.
3. **`detectFirstTurnSZO` checks board emptiness** (all cells == -1) rather than tracking turn count, keeping it a pure function without external state.
4. **M1-13 and M1-14 were already implemented** in earlier M1 sessions (DiceValue with 'SZ', DICE_FACES, legalShapesForDie, createPieceSupply with sharedColor). Only verification was needed.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bun test` | **182 pass, 0 fail** — added 28 new tests |
| `cd packages/shared && bunx tsc --noEmit` | clean |
| `cd packages/api && bunx tsc --noEmit` | clean |
| `cd packages/app && bun run check` | clean (1 pre-existing a11y warning) |

## Not verified / known gaps

- The fuzz loop does not verify floating-cell invariants (the gravity algorithm permits overhangs by design).
- Docker/Redis routes remain broken in wrangler dev — M2 target.
- `detectFirstTurnSZO` is a pure function but is not yet wired into the server turn handler — M3-4 stage.
- `getBlockedGroups` is not yet integrated into scoring — scoring currently ignores blocked-group status per R4/R15.
- No 2-player shared-color mode at the API level — M3 or M4 target.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 (session 2) — M1-10..M1-14: Skip-turn, blocked groups, first-turn S/Z, verify M1-13/14

Implemented the remaining M1 rules-engine tasks:
- **M1-10**: `trySkipTurn` checks both pieces-remaining and fit-in-board for rolled shape(s). Handles SZ face (both S and Z) and any (all 6 shapes). 12 tests covering all skip/not-skip branches.
- **M1-11**: `getBlockedGroups` reuses `findGroups` BFS, checks each group for empty orthogonal neighbors. 10 tests: single/multi-cell, edge/corner, multi-player, mixed blocked/unblocked.
- **M1-12**: `detectFirstTurnSZO` returns true when board is empty and roll is SZ. Pure function, 6 tests.
- **M1-13**: Verified `DiceValue` type has `'SZ'` member, `DICE_FACES` has 6 entries, `legalShapesForDie` correctly maps SZ→[S,Z] and any→all. No changes needed.
- **M1-14**: Verified `createPieceSupply` supports `sharedColor` parameter for 2-player shared-color mode. Tests confirm shared-object semantics.
- 182 total tests (28 new), all passing. Typecheck clean across all packages.

Next: **M2-1** (RoomDurableObject skeleton, DO storage schema).