# Verification harness (M4.6)

Status: **planned** — created 2026-11-19 after M4 was declared complete while the game
crashed on the first move. Tasks live in [PLAN.md](../PLAN.md) § M4.5 and § M4.6. Until
M4.6 lands, the only automated evidence is the shared engine tests and the API/DO tests; the
browser flow is **not** verified.

This document is the contract for the harness. If a command here does not exist yet, it is
still a task, not a suggestion.

## 1. What the harness is for

A coding agent must be able to answer "does the game work?" without a human, a screenshot, or
a browser window. That requires three layers, cheapest first:

| Layer | Command | Runtime | Proves |
| --- | --- | --- | --- |
| Engine | `cd packages/shared && bun test` | <1 s | rules, gravity, scoring, dice, termination |
| Server | `cd packages/api && bun test` | ~10 s | room lifecycle, turns, seats, WS payloads, errors |
| Browser | `bun run test:e2e` | ~60 s | the actual two-player experience in real browsers |

The server layer is the primary guard for contract bugs (identity, snapshots, seat keys).
The browser layer proves the wiring: clicks, disabled states, live updates, and that an error
never blanks the page.

## 2. Topology

```
bun run test:e2e
  ├─ webServer 1: cd packages/api && bunx wrangler dev --port 8787
  │     wait for GET http://localhost:8787/health
  ├─ webServer 2: cd packages/app && bun run dev
  │     wait for GET http://localhost:5173
  └─ Playwright
        ├─ context A (own cookie jar) ── page A ── WS /ws/room/<id>
        └─ context B (own cookie jar) ── page B ── WS /ws/room/<id>
```

Each context gets a distinct `session_id` cookie automatically, so the two players are
genuinely different sessions. Never share a context between "players".

The harness must start its own servers: an already-running dev server should cause a clear
"port in use" failure rather than a silent pass against stale code.

## 3. Determinism

Dice are random on the server, so a spec that asserts a specific placement needs a known
roll. Add a **dev-only dice queue**:

- `wrangler dev --var DICE_SEQUENCE:L,O,T,I,SZ,any` fills a queue consumed by the DO.
- `POST /dev/room/:id/dice` sets or extends the queue; it returns 404 unless
  `ENVIRONMENT === 'development'`.
- When the queue is empty the DO falls back to `rollDie()`.
- `rollDie(rng)` in `shared` stays pure; the queue lives in DO state only.

Specs must set the queue **before** `/start` and before any turn that matters. Never assert on
a random shape.

## 4. Selector contract

Design work in M5 will rewrite classes. Test IDs are the stable interface:

| `data-testid` | Element | Assertions |
| --- | --- | --- |
| `room-code` | header room ID | invite flow |
| `seat-0` … `seat-3` | lobby seat cards | occupancy, "You"/"Host" badge, join/leave |
| `start-game` | lobby start button | enabled/disabled |
| `you-are` | identity chip | "You are Player 2 (Blue)" |
| `board` | board wrapper | present, not disabled |
| `column-<x>` | one board column | hover target |
| `cell-<x>-<y>` | one cell | owner color/number, click target |
| `roll` | die face | expected die label |
| `turn-indicator` | active player line | "Your turn" vs "Waiting for …" |
| `piece-control` | controls container | disabled state, shape buttons |
| `score-<seat>` | per-player score row | score after a move |
| `toast` | toast container | error copy |
| `paused-overlay`, `game-over` | overlays | pause/winner flows |

Rules: no CSS-class selectors, no text matching for computed values (colors, scores), no
`waitForTimeout` — wait on the state transition (`expect(...).toHaveAttribute` / a toast /
the turn indicator) instead.

## 5. Spec map

| Spec | Scenario | Guards |
| --- | --- | --- |
| `lobby.spec.ts` | A creates, B opens the invite link, both see two seats and correctly labelled identities, start enables at 2 | D20, D21, D22, D31 |
| `turn.spec.ts` | A starts; B's board and controls are disabled; A rotates/flips/selects and places; both boards converge; turn moves to B | D19, D23, D28 |
| `errors.spec.ts` | clicking a full column, double-clicking a cell, and a forced 4xx each leave the board intact and show one actionable message | D19, D29 |
| `reconnect.spec.ts` | A reloads mid-game: same seat, same board, same turn; closing a tab <30 s does not pause | D25, D27 |
| `game.spec.ts` | seeded full game to completion: score deltas, skip turns, winner name/color, rematch | D24, D26 |
| `visual.spec.ts` (M5) | screenshots at 360/768/1280 | layout regressions |

Each spec must be **mutation-tested once**: revert the fix it guards, confirm the spec fails,
restore. A spec that cannot fail is not evidence.

## 6. Browser-free fallback

`scripts/dev-play.ts` must do the same two-player flow over HTTP + WebSocket and print:

```
room 8KQ2M4TA  rooms seats [A,B]
turn 1  A(seat 0) roll L   placed col 8  +0   A=0 B=0
turn 2  B(seat 1) roll SZ  placed col 3  +3   A=0 B=3
...
winner seat 1 (B)  scores {1: 12, 2: 9}
```

This is what an agent runs when Playwright browsers are unavailable (for example on the
current machine, which has no browser download). It must exit non-zero on any unexpected
error body, so it can be used in CI without Playwright.

## 7. Failure triage

| Symptom | Look at |
| --- | --- |
| Page goes blank after a click | `api.ts` error path, `applyState`, `+error.svelte` (D19) |
| Both players highlighted as the same seat | per-socket payload, `youSeat` handling (D20) |
| Second browser does not appear in the lobby | join/leave snapshot broadcast (D22) |
| Board resets on reload / game pauses | WS close grace, resume logic (D25, D27) |
| Wrong winner announced | winner seat conversion (D24) |
| `NO_PIECES` with open seats | seat-keyed supply (D26) |
| Spec passes locally, fails in CI | server startup, port conflicts, dice queue not set |

Artifacts land in `test-results/` (trace, video, screenshot). Read the trace before editing
code; it shows the last messages and DOM state.

## 8. Out of scope

- Load/performance testing (M5-14), cross-browser matrix (M5-15), and production smoke
  testing (M6-5) are separate tasks.
- The harness never asserts on engine rules directly; that is `packages/shared`'s job.
- No production-only endpoints: the dice queue must be rejected when `ENVIRONMENT` is not
  `development`.
