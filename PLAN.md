# PLAN.md — Road to playable

This is the task queue and design record for TahoeLink. Work one task at a time, tick the
box, and record non-obvious decisions at the bottom. `AGENTS.md` contains the invariants and
verification commands that apply to every task; `docs/HANDOFF.md` contains the current state.

Use the agent commands from `.pi/prompts/`: `/task <id>` to implement one task, `/verify`
for a verification pass, and `/handoff` to write the state back to `docs/HANDOFF.md`. One
deliverable per session; one Pendant goal per milestone (when the user asks for it).

Current state: **M0 complete** — Wrangler dev path works, checks pass, CI configured. Lobby join/leave works (needs Redis); game is not playable.

---

## Definition of "playable" (v1)

TahoeLink v1 is done when all of these are true:

- [ ] Two people on different devices can open the site, create/join a room, and start a game.
- [ ] 2–4 players can complete a full game; the server enforces turn order and legal moves.
- [ ] The die roll determines the piece; players can rotate/mirror it; illegal placements are
      rejected with a clear message.
- [ ] Pieces fall, stack, and cannot overlap, float, or leave the board.
- [ ] Scores update after every move and a winner is announced when the game ends.
- [ ] A player can leave and rejoin mid-game; the room pauses and resumes correctly.
- [ ] A disconnected/reloaded client recovers the current state (no stale board).
- [ ] The board is usable on a phone and with a keyboard; no console errors.
- [ ] The app is deployed to a stable URL with a documented rollback path.

---

## Rules contract

All rules have been confirmed from the physical rulebook and codified in
[`docs/GAME_RULES.md`](./docs/GAME_RULES.md). The canonical reference is that file; keep
it in sync with implementation and tests. Deviations must be recorded in the decisions log
below.

### Implemented mechanics

| Rule | Status | Location |
| ---- | ------ | -------- |
| 10×10 board, column-major | ✅ | `shared/src/constants.ts`, `types.ts` |
| 5 tetrominoes: I, O, S, T, L | ✅ | `shared/src/game-mechanics/shapes.ts` |
| 4 rotations + mirrored variant | ✅ | `shapes[shape][rotation][flip]` |
| Gravity (fall to lowest row) | ✅ | `getUpdatedBoard` (in-bounds only) |
| 2–4 players | ✅ | `MIN_PLAYERS`, `MAX_PLAYERS` (unused so far) |
| Die can roll a shape or `any` | ✅ (type only) | `DiceValue` (no roller) |
| Any rotation/flip always allowed | ✅ | shapes.ts (no restriction applied) |
| Orthogonal adjacency for links | ❌ | Not implemented |
| S/Z combined die face | ❌ | Must update `DiceValue` type; player picks S or Z |
| No piece scored twice | ❌ | Scoring invariant needed |

### Confirmed rules from `docs/GAME_RULES.md`

| Ref | Question | Answer | Where it matters |
| --- | -------- | ------ | ---------------- |
| R1 | Die faces | **I, O, T, L, S/Z (combined), TETRIS LINK** — 6 faces. S/Z is one face, player may play S or Z shape. | `rollDie` + `DiceValue` type |
| R2 | Pieces per player | **25** — 5 copies of each of the 5 shapes. | `piecesRemaining`, end condition |
| R3 | Scoring | Groups of **3+ orthogonally adjacent** pieces score. First 3 = 1 pt each (+3). Each additional = +1. Merging groups: only count unscored pieces. **No piece scored twice.** | `scoreBoard` |
| R4 | Opponent adjacency | **Blocks further linking** (§9). No negative score for adjacency. Surrounded groups are "out of play". | `scoreBoard`, blocked-group detection |
| R5 | Bonuses | **None.** No row/edge/largest-link bonus. | `scoreBoard` — simplified |
| R6 | Flipping | **Any rotation and flipping** always legal. Already supported in shapes.ts. | Validation — no restriction needed |
| R7 | Piece won't fit | **Turn is skipped** (tower nearly full). | Turn state machine |
| R8 | Game end | **Tower is full** — no piece can be placed completely within bounds. Not when pieces run out. | `isGameOver` |
| R9 | Tie-breaker | **Largest connected component** (most same-colour pieces orthogonally adjacent). | `getWinner` |
| R10 | Turn order | **First to roll TETRIS LINK** goes first, then clockwise/join-order. | `startGame`, `activePlayer` |
| R11 | Unused pieces | **Not scored.** Pieces left in a player's set at game end have no effect. | Final scoring — none |
| R12 | `any` choice | **Freely choose any shape**, including any rotation/mirror. | Validation + UI |

### Additional confirmed rules not previously captured in PLAN

| # | Rule | What to implement |
|---|------|-------------------|
| R13 | **Empty-space penalty**: −1 for 1 gap, −2 for 2+ (max −2/turn) directly beneath a placed piece. Combined with link scoring. | penalize empty space after placement |
| R14 | **First-turn S/Z penalty**: Starting player who rolls S/Z on first turn begins with negative score (empty-space penalty). | special-case in `startGame` or `applyTurn` |
| R15 | **Blocked-group detection**: A group surrounded (by opponents or board edge) is "out of play" — no further links possible. Player must start a new group. | `getBlockedGroups` or score-board logic |
| R16 | **2-player shared-colour mode**: Both players share one colour set (25 pieces, 5 per shape). | room setup, piece supply tracking |
| R17 | **S/Z die face → player picks either S or Z** in any orientation. The die face restricts which shape family, not which specific shape variant. | shape selection logic |

---

## Target data model (decide in M2)

The current `Room` has no scores, piece supply, winner, or seat ownership. Proposed shape:

```ts
type RoomStage =
  | 'waiting-for-players'
  | 'in-progress'
  | 'paused'      // a player left mid-game
  | 'complete'

interface Room {
  version: 2
  board: Board
  players: number[]                 // seat IDs in turn order
  seats: (string | null)[]          // session ID per seat 0..3
  activePlayerId: number | null
  turn: number
  roll: DiceValue
  stage: RoomStage
  scores: Record<number, number>
  piecesRemaining: Record<number, number>
  winner: number | null
  updatedAt: number
}
```

Notes:

- Store seats inside the room hash so seat + list updates are one atomic write.
- Keep `players:<roomId>` as a derived index only if it earns its keep; otherwise remove it.
- Version the hash (`room:v2:<id>`) or migrate on read.
- Add `EXPIRE` (sliding, e.g. 24 h) and a `createdAt`/`updatedAt`.

**With deployment choice B (Durable Objects):** the room state lives in DO SQLite storage,
not Redis. The DO *is* the room: seats, turn order, scores, and board are fields on the
`RoomDurableObject` class, persisted via `this.ctx.storage`. Separate Redis keys
(`players:<roomId>`, `player:<roomId>:<seat>`) are eliminated — the DO manages everything
in one place. The `Room` type above becomes the DO's state interface.

---

## Milestones

Effort labels are rough: S ≈ hours, M ≈ a day, L ≈ several days.

### M0 — Runnable baseline on Wrangler (S–M)

**Goal:** one command starts the API locally without Docker or Redis, and checks are green.

- [x] **M0-1** Add a Vite dev proxy for `/api` → `http://localhost:3000` (strip `/api`), and
      replace the hardcoded SSR base. Recommended: disable SSR for the room route
      (`export const ssr = false` in `+page.ts` or `+layout.ts`) so `API_BASE` is always
      `/api`; keep an env override for split deployments.
- [x] **M0-2** Derive cookie `Secure` from `X-Forwarded-Proto` (proxy) or an env flag, so
      HTTP localhost works while production stays secure.
- [x] **M0-3** Swap `node:crypto` for Web Crypto in `src/middleware/sessionId.ts` (use
      `crypto.randomUUID()`). This unblocks Workers compat and removes the
      `nodejs_compat` dependency.
- [x] **M0-4** Add `packages/api/wrangler.jsonc` and a Workers entry point
      (`src/index.ts` exporting `{ fetch: app.fetch }`). Verify `bunx wrangler dev`
      starts the API and responds to `/health`.
- [x] **M0-5** Fix the 4 type-only imports in `packages/shared` so `bun run check` passes.
- [x] **M0-6** Add root scripts: `dev`, `dev:api` (wrangler dev), `dev:web`, `check`,
      `test`; add a `test` script to `packages/shared`. Document the Wrangler-only
      dev workflow.
- [x] **M0-7** Add `.env.example` files and update `README.md`; delete/replace the stale
      `packages/app/README.Docker.md`; remove the stray `packages/shared/bun.lock`.
- [x] **M0-8** Add GitHub Actions: `bun install`, shared typecheck, `bun test`,
      `bun run check` (allow the known-failing check to become required only after M0-5).
- [x] **M0-9** Add a smoke script (`scripts/smoke.sh`) that starts the API via `wrangler dev`,
      creates a room, joins, and asserts JSON — usable by agents and CI.

**Acceptance:** `cd packages/api && bunx wrangler dev` + `cd packages/app && bun run dev`
opens `http://localhost:5173`; `/room/<id>` renders; create/join works; refresh keeps the
seat; `bun run check` is clean; CI is green.

**Verification:** run the smoke script; manually create + join in two browser contexts;
`curl -s localhost:3000/health`.

---

### M1 — Rules engine in `shared` (M–L)

**Goal:** all game rules that do not need Redis or HTTP are pure, tested functions.

- [ ] **M1-1** Confirm `docs/GAME_RULES.md` stays the canonical rules reference. Add a
      `.pi/skills/tahoe-rules/SKILL.md` skill with worked examples and expected scores for
      the scoring engine, if needed for verification.
- [x] **M1-2** Add `tryPlacePiece({ board, column, shape }) => { board, cells } | null`.
      Reject: column out of range, any cell out of range, any occupied cell, ceiling
      overflow. Keep a thin throwing wrapper only if callers need it.
- [x] **M1-3** Refactor `getUpdatedBoard` to use `tryPlacePiece`; preserve current correct
      gravity results. Document/enforce the "all shape columns have equal length" invariant.
- [x] **M1-4** Add `getLegalColumns(board, shape): number[]` for the UI and server.
- [x] **M1-5** Add `rollDie(rng: () => number): DiceValue` with an injectable RNG and the
      distribution: **I, O, T, L, S/Z (combined), TETRIS LINK** — 6 sides. Update the
      `DiceValue` type to reflect the combined S/Z face (e.g. `'S' | 'Z'` merged into one
      enum member, or keep both and map in `rollDie`).
- [x] **M1-6** Add `scoreBoard(board, playerId): PlayerScore` implementing the rules:
      - Groups of 3+ orthogonally adjacent pieces of the same colour score.
      - **First 3 pieces in a new group**: +1 each (+3 total).
      - **Each additional piece** added to a scored group: +1.
      - **Merging two unscored groups** → each piece in the resulting 3+ group scores +1.
      - **Merging scored group + unscored group** → only unscored pieces joining the scored
        group score +1.
      - **No piece is scored twice.** Track per-piece scored state (e.g. a `Set<string>` of
        `"{x},{y}"` keys per player).
      - After link scoring, apply **empty-space penalty**: −1 for 1 gap, −2 for 2+ gaps
        directly beneath the placed piece. Net = links gained − penalty.
      - Pure function: `scoreBoard(board, currentTurn, previousScores?) => { scores, scoredCells }`.
      - Add a re-entrant `scoreTurn(board, placedCells)` that computes the delta for one turn.
- [x] **M1-7** Add piece supply tracking: each player starts with 30 pieces (5 of each
      shape). Track `piecesRemaining: Record<playerId, Record<Shape, number>>`.
      Add `canMove(board, piecesRemaining): boolean` — true if any player has a piece that
      can fit somewhere. Add `isGameOver(board, piecesRemaining): boolean` — tower is full
      (no piece can be placed without ceiling overflow) **or** no player can move. Add
      `getWinner(scores, board): { playerId, tieBrokenBy? }` — highest score, tie-breaker is
      **largest connected component** (most same-colour orthogonally adjacent cells).
      Add `TIE_BREAKER_LIMIT` constant in case ties are unbreakable.
- [x] **M1-8** Replace the `playerId + turn * 0.001` cell encoding with a stable one
      (`playerId * 1000 + turn` and decode with `Math.floor(cell / 1000)`).
      Update `getCellBackgroundClass` and add a decode test.
- [x] **M1-9** Tests: golden placement fixtures for every shape/orientation (left wall, right
      wall, stacked, ceiling), scoring fixtures with `docs/GAME_RULES.md` worked examples,
      seeded-dice tests, empty-space penalty fixtures, merge-scoring fixtures, tie-breaker
      fixtures, and a seeded fuzz loop asserting bounds/overlap invariants and game termination.
      (Blocked-group detection fixtures deferred to M1-11 when `getBlockedGroups` exists.)
- [x] **M1-10** Add `trySkipTurn(board, piecesRemaining, diceValue): { skipped, reason? }` —
      skip if no piece of the rolled shape remains, or if that shape cannot fit entirely in
      the tower in any orientation. Use `getLegalColumns` per shape orientation.
- [x] **M1-11** Add `getBlockedGroups(board): Record<playerId, Array<Set<string>>>` — detect
      groups surrounded by opponents or board edge. Mark them "out of play" so scoring
      ignores further additions to them. This feeds scoring and the UI (which groups are
      dead).
- [x] **M1-12** Add `detectFirstTurnSZO(board, playerId, diceValue): boolean` and apply the
      empty-space penalty to the starting player's score if they roll S/Z on turn 1.
- [x] **M1-13** Update `DiceValue` type to reflect the combined S/Z face. Consider: one
      member `'sz'` with a mapping `legalShapes['sz'] = ['S', 'Z']`, or keep separate and
      handle in `rollDie`. Add a `DICE_FACES` constant array of 6 entries.
- [x] **M1-14** Add 2-player setup support: `createPieceSupply(playerCount, sharedColor?)` —
      when `sharedColor` is true, both players draw from the same 25-piece pool.

**Acceptance:** `cd packages/shared && bun test` covers every rule that does not need I/O;
no DOM/Bun/Redis imports; a seeded 1,000-game simulation always terminates without invalid
board states.

**Verification:** `bun test`; `bunx tsc --noEmit -p tsconfig.json`; inspect a dumped board
from the fuzz test.

---

### M2 — Durable Object foundation (S–M)

**Goal:** a RoomDurableObject owns room state and speaks WebSocket. Redis models and SSE
broadcasting are deleted.

- [x] **M2-1** Create `RoomDurableObject` class with DO storage schema (seats, board, stage,
      turn, roll, scores, version). Use SQLite-backed DO storage.
- [x] **M2-2** Wire DO into Hono routes: `POST /create-room` → `env.ROOMS.idFromName(id)`;
      `GET /room/:id` → DO fetch returning state. Remove `models/room.ts` and `redis.ts`.
- [x] **M2-3** WebSocket upgrade on `/ws/room/:id` → DO Hibernation API
      (`state.acceptWebSocket`). Handle connect, disconnect, and broadcast via
      `ctx.getWebSockets()`. Remove `broadcasting/` and `middleware/sse.ts`.
- [x] **M2-4** Move join/leave into DO methods: join assigns a seat, leave frees it,
      both broadcast the updated state. Remove `models/players.ts`.
- [x] **M2-5** Refresh `shared/src/events.ts` for WebSocket payloads: `connected`,
      `state`, `error`. Removed `participant-change` (SSE-era). Fix event handlers in app.
- [x] **M2-6** Test DO lifecycle with HTTP + WebSocket: create room, read state, join,
      leave, start, turn, verify rejoin idempotency, WebSocket connect/state snapshot.
      16 tests pass.
- [x] **M2-7** Document the Wrangler-only dev workflow; remove Redis from all docs, env
      files, and scripts; delete Dockerfiles and Makefile; update AGENTS.md, README.md,
      and tahoe-verify skill; remove `ioredis` from dependencies.

**Acceptance:** `bunx wrangler dev` runs the API without Redis; create/join/leave work over
WebSocket; old Redis/SSE files are deleted; DO tests pass in CI.

**Verification:** `cd packages/api && bun test`; `bunx wrangler dev` with two browser
contexts connected via WebSocket; verify room state survives wrangler restart.

---

### M3 — Server state machine on DO (M–L)

**Goal:** the DO is the single authority for a complete game — atomic moves, fanout, and
persistence are inherent.

- [ ] **M3-1** Standardize errors: `HTTPException` with `{ error: { code, message } }`;
      add a Hono `onError` handler; never leak stack traces in production.
- [ ] **M3-2** Room lifecycle: crypto room IDs (short, human-shareable), collision check,
      404 for unknown rooms, DO alarm-based expiry (TTL), `createdAt`/`updatedAt`.
- [ ] **M3-3** Full join rules on DO: stage check, seat availability, `MAX_PLAYERS`,
      idempotent rejoin for the same session, spectator mode, clear 4xx codes.
- [ ] **M3-4** Start game: require `MIN_PLAYERS`, require an occupant, set turn order +
      first player, roll the die, transition stage, broadcast full snapshot via WebSocket.
      - **First player**: players must roll the die; whoever rolls TETRIS LINK first goes
        first. For the digital version, roll once at start and assign the first roller to
        TETRIS LINK (if no one rolls it, keep rolling).
      - **First-turn S/Z penalty**: if the starting player rolls S/Z on turn 1, the
        empty-space penalty applies immediately (negative starting score).
- [ ] **M3-5** Turn: verify active player, verify shape/rotation/flip/column against the
      roll and engine rules, apply placement, recompute score, advance to the next occupied
      seat, roll the next die, detect game over, broadcast snapshot.
      - **Skip turn**: if the rolled shape has no remaining pieces, or cannot fit in any
        column per `trySkipTurn`, skip the turn and advance to the next player.
      - **S/Z roll**: player may play **either** S or Z shape (in any orientation).
      - **Scoring**: apply `scoreTurn` — link scoring + empty-space penalty = net delta.
- [ ] **M3-6** Leave/pause/resume: free seat, set `paused`, freeze turns, allow replacement/
      rejoin, resume when re-filled. Handle the active player leaving (reassign or skip).
- [ ] **M3-7** WebSocket snapshot on connect + monotonic version + heartbeat via DO alarm
      every 15–25 s. Clients ignore messages with older versions.
- [ ] **M3-8** Handle multiple tabs with the same session; make rejoin idempotent.
- [ ] **M3-9** API tests with `SELF.fetch()` and DO binding: happy-path 2/4-player game,
      invalid moves, wrong turn, stale version, leave/rejoin mid-game.

**Acceptance:** a scripted game from create-room to a winner completes over HTTP + WebSocket;
invalid moves return 4xx; concurrent moves are impossible (single-writer DO); unknown rooms
404; tests pass in CI.

**Verification:** `cd packages/api && bun test`; a `curl` + `websocat` walkthrough;
DO storage inspection via `wrangler tail` or admin endpoint.

---

### M4 — Complete the UI (L)

**Goal:** a real game screen and a lobby that can start, pause, and finish a game.

Screens/components:

- [ ] **M4-1** App shell: room header with room code, copy-invite-link button, connection
      status, and a link back home.
- [ ] **M4-2** Lobby: seat cards with colors, occupied/empty state, join/leave, spectator
      count, "Start game" for the host (enabled at `MIN_PLAYERS`), and rules link.
- [ ] **M4-3** Compose the game screen from the existing `Board`, `PieceDisplay`, and
      `PieceControl` components (currently unused). Remove or integrate `PlayerStatus` and
      `JoinButtons`.
- [ ] **M4-4** Placement preview: ghost piece in the hovered/focused column; highlight
      illegal columns; clicking anywhere in a column places there. Use `getLegalColumns`
      from `shared`.
- [ ] **M4-5** Controls: rotate left/right (fix the both-increment bug), flip, keyboard
      bindings, and only the rolled shape (or `any`) selectable.
- [ ] **M4-6** Status panels: active player, "your turn", die result (large), per-player
      scores, pieces remaining, and a color legend.
- [ ] **M4-7** Paused overlay when a player leaves mid-game; winner/complete screen with
      final scores and a rematch button.
- [ ] **M4-8** Error toasts, loading states, reconnect banner, and optimistic-disable while a
      move is in flight (no double submit).
- [ ] **M4-9** Responsive layout: board scales from 360 px, controls stack, touch targets.
- [ ] **M4-10** Accessibility: `aria-label`/`aria-live` for the board and turn/score changes,
      focus rings, reduced motion, colorblind-safe owner indicators.
- [ ] **M4-11** Spectator mode: watch without a seat, see the same board and status.
- [ ] **M4-12** Empty/edge states: unknown room, room full, game already started, room
      expired.

**Acceptance:** the Definition of "playable" UI checklist passes on desktop and a 390 px
viewport; Playwright drives a full 2-player game through the UI.

**Verification:** `bun run build`; Playwright two-context E2E; manual keyboard-only run.

---

### M5 — Playtest and polish (M)

- [ ] **M5-1** Play at least three real games with 2–4 humans; log every rules dispute.
- [ ] **M5-2** Fix the top usability issues found; re-run the rules fixtures.
- [ ] **M5-3** Room moderation: kick/close room, host transfer on leave, rematch.
- [ ] **M5-4** Performance: recompute score only when needed; avoid re-rendering 100 cells
      unnecessarily; measure DO duration/memory per room during idle periods.
- [ ] **M5-5** Observability: structured logs (no session IDs), error reporting, basic
      metrics (rooms created, games finished).
- [ ] **M5-6** Browser matrix (Chrome/Safari/Firefox, iOS Safari) and a network-throttle pass
      with WebSocket reconnect.
- [ ] **M5-7** Finalize `.pi/skills/tahoe-rules` and keep it in sync with tests.

**Acceptance:** no P0/P1 defects open; 10 consecutive scripted games complete; mobile
playtest passes.

---

### M6 — Deploy to production (M)

The DO foundation is already built in M2. M6 is now just Cloudflare configuration and CI/CD.

- [ ] **M6-1** Add `@sveltejs/adapter-cloudflare` and switch `svelte.config.js` from
      `adapter-auto`. Verify `bun run build` produces a Workers-compatible output.
- [ ] **M6-2** Provision production DO bindings, secrets (`SESSION_SECRET`), and limits.
- [ ] **M6-3** Configure custom domain, HTTPS, cookie domain/same-site, HSTS.
- [ ] **M6-4** CI deploy on `main` with preview deployments and a manual approval gate.
- [ ] **M6-5** Production smoke test: create/join/start/turn/reconnect from two devices.
- [ ] **M6-6** Set up logs (`wrangler tail`), cost alarm, and a rollback procedure.
- [ ] **M6-7** Write `docs/RUNBOOK.md`: deploy, rollback, rotate secrets, inspect DOs.

**Acceptance:** a stable URL runs a full game from two networks; a failed deploy can be
rolled back in one command; no secrets in the client bundle.

---

## Defect backlog

Cross-reference: `AGENTS.md` §6 has the seven P0 details; the table below is the full
backlog.

| ID  | Priority | Defect | Task |
| --- | -------- | ------ | ---- |
| D1  | P0 | Native dev broken (API base, proxy, cookie) | M0-1, M0-2 |
| D2  | P0 | Placement crashes on horizontal overflow; ceiling overflow silently loses cells | M1-2 |
| D3  | P0 | No turn ownership / dice / shape validation / active-player advance | M3-4, M3-5 |
| D4  | P0 | No scoring, supply, end condition, winner | M1-6, M1-7 |
| D5  | P0 | Game UI absent; components unused | M4-3…M4-12 |
| D6  | P0 | Room mutation is not atomic | — (resolved by DO single-writer in M2) |
| D7  | P1 | Event payload type mismatches | M2-5 |
| D8  | P1 | Leave mid-game does not pause/free the seat | M3-6 |
| D9  | P1 | No capacity/min-player/stage checks | M3-3, M3-4 |
| D10 | P1 | Unknown rooms return default; no TTL; weak IDs | M3-2 |
| D11 | P1 | No WebSocket snapshot/heartbeat/resync | M3-7 |
| D12 | P1 | Broadcast only reaches one process; fire-and-forget | — (resolved by DO in M2) |
| D13 | P1 | Start button not wired; rotation bug; shape not locked | M4-2, M4-5 |
| D14 | P1 | Typecheck fails on shared type-only imports | M0-5 ✅ |
| D15 | P1 | `REDIS_URL` ignored | — (deleted; Redis removed in M2) |
| D16 | P1 | No tests/CI | M0-8 ✅, M1-9 |
| D17 | P2 | Cell encoding breaks at turn 1000 | M1-8 |
| D18 | P2 | Session IDs logged; CORS wide open; stale docs | M5-5, M6-3 |

### P1/P2 details

| ID | Detail | Where |
| --- | --- | --- |
| D7 | `connected` sends `{}` but the type requires `{ roomId }`; `participant-change` sends `{ message }` but the type requires `{ participants }` | `shared/src/events.ts` (SSE files `roomSSE.ts`, `broadcastToRoom.ts` deleted in M2) |
| D8 | Leaving mid-game neither frees the list slot nor pauses the room; `unsetPlayer` deletes the seat key only | `api/src/main.ts:63-78` (rewritten as DO method in M3-6) |
| D9 | No max-player/min-player/stage checks; `MIN_PLAYERS`/`MAX_PLAYERS` unused | `api/src/main.ts:44-91` (rewritten as DO method in M3-3) |
| D10 | Unknown room IDs return a default room instead of 404; no TTL; no create collision check | `api/src/models/room.ts:31-38`, `api/src/main.ts:35-41` (rewritten as DO method in M3-2) |
| D11 | No WebSocket snapshot or heartbeat/resync | DO WebSocket handlers in M3-7 |
| D12 | Broadcasts are fire-and-forget and only reach clients on the same process | — (resolved: DO broadcasts locally via `ctx.getWebSockets()` in M2) |
| D13 | `startGame()` and `/start` exist but the UI never calls them; both rotation buttons increment; shape is freely selectable | `app/src/lib/api.ts`, `app/src/routes/room/[roomId]/+page.svelte:37-43`, `app/src/lib/components/PieceControl.svelte` |
| D14 | Typecheck fails on shared type-only imports | `shared/src/events.ts:1`, `shared/src/game-mechanics/board.ts:2` | Fixed in M0-5 |
| D15 | `REDIS_URL` is ignored; `REDIS_HOST` defaults to the Docker name | `api/src/redis.ts` (deleted in M2) |
| D16 | No tests, CI, or lint/format script | repo |
| D17 | Cell encoding `playerId + turn*0.001` breaks at turn 1000 and conflates owner/turn | `api/src/main.ts:111` (will be in DO state in M3) |
| D18 | Session IDs logged; CORS wide open; stale `README.Docker.md`; stray `shared/bun.lock` | `api/src/broadcasting/*` (deleted in M2), `app/README.Docker.md` |

---

## First agent session (recommended order)

Run each as a separate session with `/task <id>`, one commit per green task:

1. `/task M0-5` (typecheck) — small win, unblocks CI.
2. `/task M0-1`, `/task M0-2`, `/task M0-3`, `/task M0-4` (Wrangler dev path) — verify
   create/join/refresh in two browsers at the end.
3. `/task M0-6`, `/task M0-9` (scripts + smoke test).
4. `/task M0-8` (CI).
5. `/task M1-2`, `/task M1-3` (safe placement + tests) — highest-value correctness fix.
6. `/task M1-4` (legal columns) — feeds the UI and server.
7. `/task M1-5`, `/task M1-6`, `/task M1-7`, `/task M1-9`, `/task M1-10`, `/task M1-11`,
   `/task M1-12`, `/task M1-13`, `/task M1-14` (dice, scoring, supply, turn-skip,
   blocked-groups, S/Z penalty, 2-player) — rules are confirmed in `docs/GAME_RULES.md`,
   so no waiting needed. Group by dependency: dice first, then scoring, then turn-skip.
8. `/task M2-1` … `/task M2-6` (DO foundation) — wire room DO, WebSocket, remove Redis.
9. `/task M3-1` … `/task M3-9` (full state machine on DO).
10. `/task M4-3` … `/task M4-7` (game screen) — after the DO server is complete.

Stop after each session, run `/verify`, review the diff, and run `/handoff` before
continuing.

---

## Decisions log

Record choices here with a date and a one-line rationale. Agents should add entries rather
than silently choosing.

| # | Decision | Options | Choice | Why | Date |
| - | -------- | ------- | ------ | --- | ---- |
| 1 | Deployment shape | Hybrid (CF web + hosted API/Redis) vs CF-native DO rewrite | **B — Durable Objects** | Single platform, per-room single-writer atomicity, WebSocket hibernation for idle rooms, one deploy pipeline | 2026-11-14 |
| 2 | SSR for game routes | SSR room page vs `ssr = false` | **`ssr = false` for `/room/[roomId]`** | Avoids dual API bases; client fetches state via `/api` proxy | 2026-11-14 |
| 3 | Room mutation atomicity | Lua, WATCH/MULTI, lock, single writer (DO) | **DO (single writer)** | Inherent in deployment choice B; no locks or Lua needed | 2026-11-14 |
| 4 | Realtime transport | SSE vs WebSocket | **WebSocket (DO Hibernation API)** | Best fit for Durable Objects; hibernation handles idle rooms cheaply | 2026-11-14 |
| 5 | Cell encoding | `owner + turn*0.001` vs `owner*1000+turn` vs objects | TBD | Current encoding is fragile and conflates concerns | |
| 6 | Player identity | Cookie session vs signed token vs accounts | **Cookie (httpOnly, session_id)** | Lowest friction for a link-shared game; `Secure` derived via `X-Forwarded-Proto` | 2026-11-14 |
| 7 | Room code format | Random base36 vs crypto base32, length | Keep base36 for v1 | Short shareable IDs; collision check planned for M3-2 | 2026-11-14 |
| 8 | Rules reference | Write into skill vs separate doc | **`docs/GAME_RULES.md`** | Single canonical file; skill can reference it for verification | 2026-11-16 |
| 9 | S/Z die face handling | Combined enum (`'sz'`) vs keep `'S'` and `'Z'` separate | TBD — likely a `DiceValue` member `'sz'` mapped to `legalShapes: ['S', 'Z']` | Player picks either S or Z; one die face, two playable shapes | 2026-11-16 |
| 10 | Redis connection in Workers | Module-scope vs lazy init | **Lazy init via Proxy** | Avoids global-scope crash in Workers while Redis is still used pre-M2 | 2026-11-14 |
| 11 | API base strategy | Env override vs hardcoded vs SSR-per-route | **`ssr = false` + Vite proxy + `/api` constant** | Simplest setup: browser always uses `/api`, Vite proxies to wrangler dev; env override for split deployments | 2026-11-14 |
| 12 | Cookie Secure policy | Always true vs derived from header/env | **Derive from `X-Forwarded-Proto`; override via `COOKIE_SECURE` env** | Plain HTTP (localhost) works without browser warnings; production behind TLS auto-detects | 2026-11-14 |
| 13 | Occupied-cell check in `tryPlacePiece` | Keep vs remove | **Keep as defense-in-depth** | The gravity algorithm places pieces above all obstructions (proven by the math: `y - 1 < height` for every column). An occupied-cell conflict cannot occur with contiguous board state. The check is kept as a safety invariant for corrupted states and future shape variants. | 2026-11-16 |
| 14 | DiceValue type for combined S/Z face | Keep S & Z as separate shapes vs 'SZ' member | **Separate `Shape` type with S & Z; `DiceValue` has `'SZ'` member** | Clean separation: Shape represents all 6 geometric shapes (L, O, T, I, S, Z); DiceValue represents die faces (I, O, T, L, SZ, any). `legalShapesForDie` maps SZ→[S,Z] and any→all. | 2026-11-16 |
| 15 | Scoring: no-piece-twice tracking | Set<string> vs Map<string,boolean> vs separate per-player table | **Set<string> inside PlayerScore** | O(1) lookup for scored-cell check; serialized as sorted string[] for determinism. Pure function model. | 2026-11-16 |
| 16 | Cell encoding | `playerId*1000+turn` vs `{owner,turn}` objects | **`playerId*1000+turn` with `CELL_OWNER_MULTIPLIER=1000`** | Keeps board as flat `number[][]`; avoids object overhead; supports up to 999 turns per player. | 2026-11-16 |
| 17 | Piece count per player | 25 (5×5 shapes) vs 30 (5×6 shapes) | **30 (6 shapes × 5 each)** | We have 6 distinct shape geometries (L,O,T,I,S,Z); splitting S/Z means each needs its own piece pool. | 2026-11-16 |
| 18 | DO persistence | Key-value `storage.put/get` vs SQL API | **Key-value storage** | Simpler migration from Redis-like API; works with both KV-style and SQLite-backed DO storage | 2026-11-16 |
| 19 | DO state transport | SSE events → WebSocket JSON envelopes `{event, data}` | **WebSocket with `{event, data}`** | DO Hibernation API's `getWebSockets()` broadcasts to all WS clients; JSON envelope matches existing event types | 2026-11-16 |
| 20 | DO type declarations | Custom `cloudflare.d.ts` vs `@cloudflare/workers-types` | **Custom declaration file** | Avoids adding an npm dependency; the `cloudflare:workers` runtime module is provided by Workers | 2026-11-16 |

---

## Non-goals for v1

- User accounts, profiles, friends, chat, matchmaking, rankings, or persistence across weeks.
- An AI opponent or solitaire mode.
- Spectator chat or streaming features.
- Native mobile apps.
- Microservices, Kubernetes, or a database other than DO storage.
- A custom rendering engine (DOM/Tailwind is enough for a 10×10 board).

---

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Rules ambiguity | Scoring/tests misaligned with physical game | Resolved — `docs/GAME_RULES.md` is the canonical reference; deviations logged in decisions log |
| DO learning curve | Time lost to Cloudflare-specific quirks | Use `wrangler dev` from M0; smoke-test WebSocket hibernation in M2 |
| Mobile WebSocket/proxy idle timeouts | Clients silently stop updating | Heartbeat + snapshot on reconnect via DO alarms |
| Read-modify-write races | Two moves overwrite each other | Eliminated by DO single-writer in M2 |
| Scope creep into accounts/chat | Never ships | Enforce non-goals |
