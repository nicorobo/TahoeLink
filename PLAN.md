# PLAN.md — Road to playable

This is the task queue and design record for TahoeLink. Work one task at a time, tick the
box, and record non-obvious decisions at the bottom. `AGENTS.md` contains the invariants and
verification commands that apply to every task; `docs/HANDOFF.md` contains the current state.

Use the agent commands from `.pi/prompts/`: `/task <id>` to implement one task, `/verify`
for a verification pass, and `/handoff` to write the state back to `docs/HANDOFF.md`. One
deliverable per session; one Pendant goal per milestone (when the user asks for it).

Current state (2026-11-19): **M0–M4 are marked done, but the game is not playable.** M4 was
closed on typecheck/build evidence only; no browser flow was ever exercised. A scripted
two-client probe reproduced a UI crash on error responses, leaked seat identity to every
client (both players render as red), never refreshed the lobby on join, never resumed a
paused game, and announced the wrong winner. The queue below is **M4.5 (fix the loop) →
M4.6 (verification harness) → M5 (UX/visual design) → M6 (deploy)**. Do not skip ahead:
M4.5 is the only milestone that makes the product work.

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

- [x] **M3-1** Standardize errors: `HTTPException` with `{ error: { code, message } }`;
      add a Hono `onError` handler; never leak stack traces in production.
- [x] **M3-2** Room lifecycle: crypto room IDs (short, human-shareable, 8-char Crockford base32),
      collision check (DO returns 409 Conflict, retry up to 5 attempts),
      404 for unknown rooms (state not auto-initialized), DO alarm-based 24h sliding TTL,
      `createdAt`/`updatedAt` (already existed).
- [x] **M3-3** Full join rules on DO: stage check, seat availability, `MAX_PLAYERS`,
      idempotent rejoin for the same session, spectator mode, clear 4xx codes.
      - Stage checks: `waiting-for-players` or `paused` only
      - MAX_PLAYERS enforced via 4-element seats array (indexOf(null) returns -1 when full)
      - Spectator mode: any WebSocket client connects without a seat (no HTTP join needed)
      - All 4xx use structured `{ error: { code, message } }` format
- [x] **M3-4** Start game: require `MIN_PLAYERS`, require an occupant, set turn order +
      first player, roll the die, transition stage, broadcast full snapshot via WebSocket.
      - **First player**: players must roll the die; whoever rolls TETRIS LINK first goes
        first. For the digital version, roll once at start and assign the first roller to
        TETRIS LINK (if no one rolls it, keep rolling).
      - **First-turn S/Z penalty**: if the starting player rolls S/Z on turn 1, the
        empty-space penalty applies immediately (negative starting score; implemented as
        flat −1 on start, detected via `detectFirstTurnSZO`).
- [x] **M3-5** Turn: verify active player, verify shape/rotation/flip/column against the
      roll and engine rules, apply placement, recompute score, advance to the next occupied
      seat, roll the next die, detect game over, broadcast snapshot.
      - **Skip turn**: if the rolled shape has no remaining pieces, or cannot fit in any
        column per `trySkipTurn`, skip the turn and advance to the next player.
      - **S/Z roll**: player may play **either** S or Z shape (in any orientation).
      - **Scoring**: apply `scoreTurn` — link scoring + empty-space penalty = net delta.
- [x] **M3-6** Leave/pause/resume: free seat, set `paused`, freeze turns, allow replacement/
      rejoin, resume when re-filled. Handle the active player leaving (reassign or skip).
- [x] **M3-7** WebSocket snapshot on connect + monotonic version + heartbeat via DO alarm
      every 15–25 s. Clients ignore messages with older versions.
- [x] **M3-8** Handle multiple tabs with the same session; make rejoin idempotent.
- [x] **M3-9** API tests with `SELF.fetch()` and DO binding: happy-path 2/4-player game,
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

- [x] **M4-1** App shell: room header with room code, copy-invite-link button, connection
      status, and a link back home.
- [x] **M4-2** Lobby: seat cards with colors, occupied/empty state, join/leave, spectator
      count, "Start game" for the host (enabled at `MIN_PLAYERS`), and rules link.
- [x] **M4-3** Compose the game screen from the existing `Board`, `PieceDisplay`, and
      `PieceControl` components (currently unused). Remove or integrate `PlayerStatus` and
      `JoinButtons`.
- [x] **M4-4** Placement preview: ghost piece in the hovered/focused column; highlight
      illegal columns; clicking anywhere in a column places there. Use `getLegalColumns`
      from `shared`.
- [x] **M4-5** Controls: rotate left/right (fix the both-increment bug), flip, keyboard
      bindings, and only the rolled shape (or `any`) selectable.
- [x] **M4-6** Status panels: active player, "your turn", die result (large), per-player
      scores, pieces remaining, and a color legend.
- [x] **M4-7** Paused overlay when a player leaves mid-game; winner/complete screen with
      final scores and a rematch button.
- [x] **M4-8** Error toasts, loading states, reconnect banner, and optimistic-disable while a
      move is in flight (no double submit).
- [x] **M4-9** Responsive layout: board scales from 360 px, controls stack, touch targets.
- [x] **M4-10** Accessibility: `aria-label`/`aria-live` for the board and turn/score changes,
      focus rings, reduced motion, colorblind-safe owner indicators.
- [x] **M4-11** Spectator mode: watch without a seat, see the same board and status.
- [x] **M4-12** Empty/edge states: unknown room, room full, game already started, room
      expired.

> **Status: scaffolding, not playable.** The components and screens exist, but the
> acceptance criteria below were never exercised. Session 13 signed M4 off with
> `bun run check` and `bun run build` only, which is why D19–D29 shipped. M4.5 and M4.6
> exist to close exactly this gap; do not treat the checkboxes above as evidence.

**Acceptance (not met):** the Definition of "playable" UI checklist passes on desktop and a
390 px viewport; Playwright drives a full 2-player game through the UI.

**Verification (not performed):** `bun run build`; Playwright two-context E2E; manual
keyboard-only run. Re-run all three after M4.5 and M4.6.

---

### M4.5 — Make M4 actually playable (P0 hardening) (M)

**Why:** M4 shipped a game screen that was never driven by a human or a browser test. The
client treats error bodies as state (one rejected move blanks/crashes the page), the state
broadcast is built from the actor's session so every client adopts the actor's seat, the
lobby never receives `seats`, a paused game can never resume, and the winner is off by one.
Fix these before spending a minute on visual polish.

**Goal:** two real browsers complete a game with no console errors, and every rejected
action leaves the board, score, and turn untouched.

- [x] **M4.5-1** Fix identity on the wire. Use **0-based seats on the wire**; the engine's
      1-based owner exists only inside `shared` calls. In `shared/src/events.ts`, replace
      `playerId`/`playerPosition` with `youSeat: number | null` in `StatePayload`, expose
      `scores`/`piecesRemaining` keyed by seat, and add `activeSeat`/`winnerSeat` (1-based
      keys stay in DO storage only, decision 24). Stop
      building one payload from the actor's session and broadcasting it
      (`room-do.ts` `handleStart`/`handleLeave`/`handleTurn` call
      `buildStatePayload(sessionId)` → `broadcast`): build a payload **per socket** from
      `ws.deserializeAttachment().sessionId`. In `app/src/lib/events/index.ts` set
      `playerState.playerId` only from `youSeat` and delete the `>= 0` fallback that lets a
      broadcast overwrite identity. Update `+page.ts`, `+page.svelte`, `Board`, `StatusPanel`,
      `PlayerSelectionScreen` and `PieceDisplay` to the new field.
      *Acceptance:* a spectator stays `youSeat: null`; two seated clients each see their own
      seat and only their own seat; `playerPosition` no longer exists.
- [x] **M4.5-2** Stop treating errors as state. Wrap `app/src/lib/api.ts` in one request
      helper that throws `ApiError { code, message }` on `!res.ok` or an `{ error }` body;
      add a `zValidator` `defaultHook` in `api/src/main.ts` so Zod failures return
      `{ error: { code: 'INVALID_REQUEST', message } }` instead of the current
      `{ success: false, error: { name: 'ZodError', … } }`. In `+page.svelte` route every
      mutation through `try/catch` + `addToast`, and apply payloads through a single
      `applyState(payload)` in `state.svelte.ts` that ignores missing fields. Add
      `src/routes/+error.svelte`; keep the last good board on failure.
      *Acceptance:* a 400/500 produces a toast, stage/board/turn are unchanged, and no
      unhandled rejection reaches the console.
- [x] **M4.5-3** Fix snapshot and lobby sync. (a) `handleWebSocketUpgrade` must
      `await this.ensureLoaded()` before `acceptWebSocket` and before the first snapshot
      (today it is fire-and-forget, so a cold DO sends none). (b) `connected` must not seed
      the stale-version gate in `app/src/lib/events/index.ts` — it makes the first snapshot
      same-version, so it is always dropped. (c) Add a client→server `resync` message, sent
      on open/reconnect and after a rejected mutation; reply with a personalized snapshot.
      (d) Broadcast a full snapshot on join and leave in addition to
      `player-joined`/`player-left`, and make those handlers merge `seats`/`stage` (today
      seat cards never change until a reload).
      *Acceptance:* with two browsers, a join updates the first browser's seat cards within
      one second and the first connect to a fresh room receives a snapshot.
- [x] **M4.5-4** Enforce turn ownership in the UI. `Board.svelte` is clickable for everyone
      and `PieceControl` is shown to every seated player. Derive
      `isMyTurn = youSeat !== null && youSeat === activeSeat && stage === 'in-progress' && !pending`,
      pass `disabled={!isMyTurn}`, and show a non-blocking "Player N's turn" line. Normalize
      rotation in `PieceControl` (`rotation = (rotation + 4) % 4` on each mutation) and send
      the normalized value in `makeMove` — today a rotate-left then click posts
      `rotation: -1`, which Zod rejects. Add a `pending` guard so a double-click cannot fire
      two turns.
      *Acceptance:* a non-active player cannot reach `/turn` from the UI; ten rotate-lefts
      still place a piece; two fast clicks produce one move.
- [x] **M4.5-5** Resume and reconnect. `handleJoin` allows joining a `paused` room but nothing
      ever sets `stage` back to `in-progress`, so a paused game is dead. Resume when every
      previously occupied seat is filled again, keeping `activePlayerId` valid. Also stop
      freeing the seat the instant a socket closes: `webSocketClose` currently pauses the
      game on F5. Schedule a ~30 s grace alarm per session and cancel it when any socket for
      that session reconnects.
      *Acceptance:* reload mid-game keeps seat, board, score and turn; a tab closed for
      <30 s does not pause; the game resumes after a rejoin.
- [x] **M4.5-6** Key game state by seat, and map the winner back to a seat. `handleStart`
      builds `scores`/`piecesRemaining` from join-order index (`i + 1`) instead of seat
      (`playerIds[i] + 1`), so a room with seats 0 and 2 returns `NO_PIECES` forever.
      `getWinner` returns a 1-based player ID while the UI prints `winner + 1` and colors
      `PLAYER_COLORS[winner]`, announcing the wrong player. Give a replacement occupant of a
      paused seat that seat's pieces and score (record it in the decisions log).
      *Acceptance:* a game with seats 0 and 2 plays; the winner banner and its color match
      the winning seat.
- [x] **M4.5-7** Return the actor's personalized snapshot from every mutation
      (`buildStatePayload(sessionId)`) instead of `publicRoom()`, so the UI never depends on
      broadcast ordering for scores, pieces, or winner. Delete the unused `turn-start` event
      from `events.ts` (or emit it) so the wire contract has no dead entries.
      *Acceptance:* with the WebSocket disconnected, a legal move still updates score, turn
      and winner on screen.
- [x] **M4.5-8** Add API-level regression tests for each fix in
      `packages/api/src/__tests__/room-do.test.ts`: two clients + spectator WS identity,
      cold-start snapshot, join updates the lobby, start→turn→pause→resume→complete,
      Zod error envelope, non-active move, gap-seat `NO_PIECES` case, winner-to-seat mapping.
      Each test must fail against the current code and pass after its fix.

**Acceptance:** two browser contexts create, join, start, play 10+ moves (rotate/flip/shape),
refresh mid-game, and finish with the correct winner and zero console errors or unhandled
rejections.

**Verification:** manual two-context pass; `cd packages/api && bun test` with `wrangler dev`
running; the browser-free two-client probe (`scripts/dev-play.ts`, M4.6-6) once it exists.

---

### M4.6 — Agent verification harness (M)

**Goal:** one command tells an agent whether the game works end to end, and a failure
leaves artifacts an agent can act on without a human. See `docs/VERIFICATION.md` for the
design, selector contract, and triage loop.

- [ ] **M4.6-1** Add `@playwright/test` at the repo root; `playwright.config.ts` with two
      `webServer` entries (`cd packages/api && bunx wrangler dev --port 8787` waiting on
      `/health`, and `cd packages/app && bun run dev` waiting on `:5173`), `trace:
      'on-first-retry'`, `video: 'retain-on-failure'`, one chromium project plus a 390 px
      viewport project. Root scripts `test:e2e`, `test:e2e:ui`. Document
      `bunx playwright install chromium` (browsers are not installed on this machine yet).
- [ ] **M4.6-2** Publish a selector contract: add `data-testid` to the board, each column,
      each cell (`cell-<x>-<y>`), seat cards (`seat-<i>`), `you-are`, `roll`, `turn-indicator`,
      `piece-control`, `score-<seat>`, `toast`, `paused-overlay`, `game-over`. Specs must use
      test IDs, never Tailwind classes.
- [ ] **M4.6-3** Deterministic dice for tests. Add a dev-only dice queue (env binding
      `DICE_SEQUENCE`, e.g. `L,O,T,I,SZ,any`) consumed by `rollDie` in the DO, plus a
      dev-only `POST /dev/room/:id/dice` that 404s unless `ENVIRONMENT === 'development'`.
      Unit-test the queue and assert production rejects the endpoint.
- [ ] **M4.6-4** Two-context fixture and core specs: `lobby.spec.ts` (create → invite link in
      a second context → both see both seats and correct identities → start enables),
      `turn.spec.ts` (start → non-active board/controls are disabled → rotate/flip → place →
      both boards converge → turn advances), `errors.spec.ts` (illegal column keeps the page
      alive and shows an actionable message).
- [ ] **M4.6-5** `game.spec.ts`: play a full seeded game to completion, assert score deltas,
      skip-turn visibility, winner identity/color, and the rematch/new-game path.
- [ ] **M4.6-6** `scripts/dev-play.ts`: create → join two sessions → start → N seeded moves
      over HTTP/WebSocket → print a board, scores, and turn summary; no browser required.
      This is the fallback when Playwright browsers are unavailable.
- [ ] **M4.6-7** Failure ergonomics: document where traces/videos land, add an `--reporter=list`
      default, and extend `.pi/skills/tahoe-verify/SKILL.md` with the E2E matrix and a triage
      section (which spec maps to which defect class).
- [ ] **M4.6-8** CI: run `test:e2e` on pull requests with chromium only and a 10-minute cap;
      keep the browser-free unit/API tests as the fast gate.

**Acceptance:** from a clean checkout with browsers installed, `bun run test:e2e` drives two
browser contexts through a full game and passes; reverting any single M4.5 fix makes its
matching spec fail (verify once per fix and record it in the handoff).

**Verification:** run the suite against the current code *before* the M4.5 fixes and record
the expected red result, then again after; upload one artifact set.

---

### M5 — UX, visual design, and playtest (L)

**Goal:** the game looks intentional, teaches itself, and is pleasant on a phone. Start only
after M4.5 and M4.6 are green — polish on a broken loop hides regressions.

- [ ] **M5-1** Design system. Define tokens in `packages/app/src/app.css` with Tailwind v4
      `@theme`: player palette with checked text contrast (≥4.5:1), surface/border/text ramp,
      radius, shadow, and motion durations. Replace the duplicated `PLAYER_COLORS` arrays in
      `Board`, `StatusPanel`, `PlayerSelectionScreen`, and `PieceDisplay` with one
      `playerColorClasses` helper.
- [ ] **M5-2** Landing and join-by-code. Hero with the name, one-line pitch, "Create room",
      and a "Join with code" input that routes to `/room/<code>`; support `?room=` deep links
      and the native share sheet on mobile; keep the room code large and copyable.
- [ ] **M5-3** Lobby redesign: four seat cards in the real player colors, "You" and "Host"
      badges, join/leave per seat, spectator count, "Waiting for players (1/2)", and a
      prominent invite action. Show which color you will play before starting.
- [ ] **M5-4** Player names: `seats` become `(Seat | null)[]` with `{ sessionId, name }`;
      `join` accepts an optional sanitized display name (≤16 chars, fallback "Player N");
      migrate DO state on read; show names in the lobby, turn line, scores, and pause overlay.
      This also removes the "Occupied/Empty" placeholder from decision 29.
- [ ] **M5-5** Game layout: three zones on desktop (scores + turn | board | die, piece,
      controls), board first on mobile with sticky controls. Render the die as a face (shape
      glyph or "TETRIS LINK" badge), not a bare letter.
- [ ] **M5-6** Board craft: rounded cells inside a framed board, subtle grid, ghost piece with
      an outline, hovered-column highlight, last-placed-piece pulse, and a floating `+N` when
      a move scores. All motion behind `motion-reduce`.
- [ ] **M5-7** Turn clarity: "Your turn — place {shape}" vs "Waiting for Alice…", an
      active-seat ring in the scoreboard, a disabled board that explains why, and a visible
      line when your turn is skipped because the shape does not fit (R7).
- [ ] **M5-8** Feedback: a compact event feed of the last three moves alongside toasts,
      actionable error copy ("Column 4 is full — pick another"), toasts reserved for
      connection loss, and de-duplication so one error yields one toast.
- [ ] **M5-9** Onboarding: a "How to play" drawer with three steps (roll → place → score), a
      first-turn hint pointing at die/piece/board, and the rules link; remember dismissal.
- [ ] **M5-10** Keyboard and a11y: column cursor (arrow keys) with Enter to place, `Esc` to
      cancel, focus moves to the board on your turn, visible focus rings, `aria-live` for turn
      and score changes, and an axe-core scan with zero serious violations.
- [ ] **M5-11** Responsive verification: Playwright screenshots at 360×640, 768×1024, and
      1280×800; no horizontal scroll; 44 px touch targets.
- [ ] **M5-12** Play at least three real games with 2–4 humans; log every rules dispute and
      usability issue.
- [ ] **M5-13** Room moderation: kick/close room, host transfer on leave, rematch in the same
      room (reuse seats and colors), and leave-and-return without losing the score.
- [ ] **M5-14** Performance and observability: recompute only the affected score, avoid
      re-rendering all 100 cells per message, structured logs without session IDs, and metrics
      for rooms created and games finished.
- [ ] **M5-15** Browser matrix (Chrome/Safari/Firefox, iOS Safari) and a throttled-network
      pass with WebSocket reconnect.
- [ ] **M5-16** Finalize `.pi/skills/tahoe-rules` and keep it in sync with the engine tests.

**Acceptance:** the M4.5 browser flow stays green after every task; lobby, board, and turn
state are readable at a glance; a first-time player can start a game without being told what
to click; no P0/P1 defects open; 10 consecutive scripted games complete.

**Verification:** `bun run test:e2e`, screenshot diffs, the axe scan, and three human
playtests.

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
| D13 | P1 | Start button not wired (DONE M4-2); rotation bug; shape not locked | M4-2 ✅, M4-5 ✅ |
| D14 | P1 | Typecheck fails on shared type-only imports | M0-5 ✅ |
| D15 | P1 | `REDIS_URL` ignored | — (deleted; Redis removed in M2) |
| D16 | P1 | No tests/CI | M0-8 ✅, M1-9 |
| D17 | P2 | Cell encoding breaks at turn 1000 | M1-8 |
| D18 | P2 | Session IDs logged; CORS wide open; stale docs | M5-14, M6-3 |
| D19 | P0 | A rejected move assigns `undefined` to the board (error body treated as state) and crashes the page | M4.5-2 |
| D20 | P0 | Broadcast state is built from the actor's session, so every client adopts the actor's seat (both players render red) | M4.5-1 |
| D21 | P0 | First WS snapshot is dropped by the version gate; a cold DO sends no snapshot at all | M4.5-3 |
| D22 | P0 | Join/leave broadcast only `playerIds`; lobby seats and stage never update until reload | M4.5-3 |
| D23 | P0 | Rotate-left posts `rotation: -1`, Zod rejects it, the response blanks the page | M4.5-4 |
| D24 | P0 | Winner is 1-based but displayed as `winner + 1`, so the wrong player is announced | M4.5-6 |
| D25 | P0 | A paused room never returns to `in-progress`; a rejoin cannot resume | M4.5-5 |
| D26 | P0 | Scores/supply keyed by join order, not seat; a gap-seat room returns `NO_PIECES` | M4.5-6 |
| D27 | P1 | WebSocket close frees the seat immediately, so F5 pauses the game | M4.5-5 |
| D28 | P1 | Board and controls stay enabled for the non-active player | M4.5-4 |
| D29 | P1 | Zod failures return `{ success, error: { name } }`, not the documented `{ error: { code, message } }` | M4.5-2 |
| D30 | P1 | No E2E harness; M4 was signed off on typecheck/build alone | M4.6 |
| D31 | P1 | No join-by-code UI; a player with the code must edit the URL | M5-2 |
| D32 | P1 | Keyboard can rotate but cannot select a column or place a piece | M5-10 |
| D33 | P2 | Player color map duplicated in four components and diverges from the board encoding | M5-1 |

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
| D19 | `makeMove` does `roomState.board = res.board` without checking `res.ok`; a 400 body has no `board`/`stage`, so `{#each board}` throws and the stage conditionals all fail | `app/src/routes/room/[roomId]/+page.svelte` (`makeMove`), `app/src/lib/api.ts` |
| D20 | `handleStart`/`handleLeave`/`handleTurn` call `buildStatePayload(sessionId)` and then `broadcast()` that one payload, including `playerId`/`playerPosition`; the client applies `playerPosition` whenever it is `>= 0` | `api/src/durable-objects/room-do.ts`, `app/src/lib/events/index.ts` |
| D21 | `handleWebSocketUpgrade` calls `this.ensureLoaded()` without `await`; and `connected` sets `lastStateVersion`, so the immediately following same-version `state` is ignored | `room-do.ts` (upgrade), `app/src/lib/events/index.ts` |
| D22 | `handleJoin` broadcasts `player-joined` with `{ playerIds }` only; `player-joined`/`player-left` handlers never touch `roomState.seats` | `room-do.ts` (join/leave), `app/src/lib/events/index.ts` |
| D23 | `PieceControl.rotateLeft` decrements with no normalization; `makeMove` forwards `pieceState.rotation` verbatim; route schema is `min(0).max(3)` | `app/src/lib/components/PieceControl.svelte`, `+page.svelte`, `api/src/main.ts` |
| D24 | `getWinner` returns a 1-based engine player ID; the DO stores it as `winner`; UI prints `Player {winner + 1}` and indexes `PLAYER_COLORS[winner]` | `api/src/durable-objects/room-do.ts`, `+page.svelte`, `StatusPanel.svelte` |
| D25 | Only `handleStart` sets `in-progress`; `handleJoin` accepts `paused` but never flips the stage back | `room-do.ts` |
| D26 | `handleStart` loops `i` over `playerIds` and uses `pid = i + 1` instead of `playerIds[i] + 1` | `room-do.ts` (`handleStart`) |
| D27 | `webSocketClose` frees the seat and sets `paused` on the last socket close; a reload is indistinguishable from leaving | `room-do.ts` (`webSocketClose`) |
| D28 | `<Board>` gets no `disabled` prop and `PieceControl` renders for any seated player regardless of `activePlayer` | `+page.svelte`, `Board.svelte`, `PieceControl.svelte` |
| D29 | `zValidator` has no `defaultHook`; its failure body is `{ success: false, error: { name: 'ZodError', message: '<json>' } }` | `api/src/main.ts` |
| D30 | `packages/app` has no test runner and no Playwright dependency; AGENTS baseline is typecheck + build only | repo |
| D31 | Home page only offers `Create Room`; the room code is displayed but has no input path | `app/src/routes/+page.svelte` |
| D32 | `PieceControl` handles arrows/R/F/digits; there is no column cursor, Enter, or board focus | `app/src/lib/components/PieceControl.svelte`, `Board.svelte` |
| D33 | `PLAYER_COLORS` is re-declared in `Board`, `StatusPanel`, `PlayerSelectionScreen`, `PieceDisplay`; `getCellBackgroundClass` holds a fifth copy | `app/src/lib/utils/color.ts` and components |

---

## Next sessions (current queue)

Run each as its own session with `/task <id>`, one commit per green task. Stop after each
session, run `/verify`, review the diff, and run `/handoff` before continuing.

1. **Stop the bleeding:** `/task M4.5-2` (error handling, no more crash) and
   `/task M4.5-4` (turn gating + normalized rotation).
2. **Identity and sync:** `/task M4.5-1` (wire seats + per-socket payload) and
   `/task M4.5-3` (snapshot, join/leave sync, `resync`). Do them in one session — both
   change the payload type.
3. **Game mechanics of the loop:** `/task M4.5-6` (seat keys, winner mapping),
   `/task M4.5-5` (resume + disconnect grace), `/task M4.5-7` (mutation snapshots).
4. **Lock it down:** `/task M4.5-8` (API regression tests). M4.5 is done only with a
   two-browser pass recorded in the handoff.
5. **Build the net:** `/task M4.6-1` … `/task M4.6-7`. Run the suite against the unfixed
   code first if possible and record the red baseline.
6. **Design:** `/task M5-1` … `/task M5-11` in order (tokens first, then landing/lobby, then
   board/game layout, then a11y), then `/task M5-12` (human playtest).
7. **Finish:** `/task M5-13` … `/task M5-16`, then M6 deploy.

Do not start M5 before M4.6 exists. Visual work without an E2E net is how M4 was declared
complete while the game crashed on the first move.

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
| 7 | Room code format | Random base36 vs crypto base32, length | **Crockford base32, 8 chars from 5 random bytes** | Short shareable IDs; unambiguous characters (no I/L/O/U); 40-bit entropy with collision retry | 2026-11-16 |
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
| 21 | Error response format | Plain string vs `{ code, message }` vs array | **`{ error: { code, message } }`** | Matches existing `ErrorPayload` in events.ts; machine-readable code enables client-side i18n; structured, not just a string | 2026-11-16 |
| 22 | Room TTL mechanism | DO alarm vs cron vs KV expiry | **DO alarm (sliding, reset on every persist)** | DO alarms fire at a set time and trigger `alarm()` handler; sliding expiry naturally extends on activity; no external cron needed | 2026-11-16 |
| 23 | Room ID generation | `Math.random().toString(36)` vs `crypto.randomUUID()` vs base32 from random bytes | **5 bytes → 8 Crockford base32 chars** | Short enough for verbal sharing; avoids ambiguous I/L/O/U characters; crypto-strength randomness; 40-bit entropy with collision retry | 2026-11-16 |
| 24 | Player ID convention for scores | 1-based (engine convention: seatIndex + 1) vs 0-based (seat index as-is) | **1-based scores in DO state** | Engine functions (`createPieceSupply`, `scoreTurn`, etc.) use 1-based player IDs; DO stores scores with 1-based keys and maps seatIndex → owner via +1/-1 at the engine boundary | 2026-11-16 |
| 26 | Heartbeat mechanism | Separate heartbeat alarm vs combined TTL + heartbeat single alarm | **Single alarm for both** | DO only has one `setAlarm`; the alarm handler sends heartbeat (~20s) then checks TTL (24h) and reschedules. Idle rooms without WS connections use TTL interval to avoid waking up. | 2026-11-16 |
| 27 | Multi-tab WebSocket tracking | Persisted vs in-memory connection counter | **In-memory `Map<string, number>`** | WebSocket connections are inherently ephemeral; on DO restart all connections are lost. No need to persist connection counts. | 2026-11-16 |
| 28 | Connection status state | Shared `$state` vs local `$state` in page | **Local `$state` in `+page.svelte`** | Imports are read-only bindings; local `$state` avoids reassignment errors and keeps the concern scoped to the room page | 2026-11-16 |
| 29 | Lobby seat display | No player names exist yet; seats hold session UUIDs | **Show "Occupied"/"Empty"** | Session UUIDs are not user-friendly; real player names deferred until a naming system is added. Seat color from `getCellBackgroundClass(seatIndex)` signals identity. | 2026-11-16 |
| 30 | Game screen composition | PlayerStatus+JoinButtons vs inline player info vs import PlayerStatus | **Inline player info; drop PlayerStatus/JoinButtons** | PlayerStatus depends on JoinButtons (legacy SSE join UI); lobby join is already handled by PlayerSelectionScreen. Game screen shows "You are Player X" + Leave button inline. Removed dead `onJoin` function. Changed `makeMove(cell)` → `makeMove(column)` since Board passes column index directly. | 2026-11-16 |
| 31 | PieceControl `legalShapes` prop | Compute inside PieceControl vs accept from parent | **Accept from parent as a prop** | Keeps PieceControl decoupled from global roomState; parent computes via `legalShapesForDie(roomState.roll)` and passes the result. Consistent with the parent-driven `currentShape`/`legalCols` pattern in `+page.svelte`. | 2026-11-16 |
| 32 | Keyboard handler placement | PieceControl container vs +page.svelte | **PieceControl container with `onkeydown`** | Co-locates keyboard + button controls in one component; page-level handler would need to reach into PieceControl's logic. Container uses `tabindex="-1"` + `role="region"` for focusability. | 2026-11-16 |
| 33 | Board responsive scaling | `max-sm:w-8 max-sm:h-8` vs `overflow-auto` scrollable container vs CSS `scale()` transform | **Both: `max-w-full overflow-auto` container + `max-sm:w-8 max-sm:h-8` cells** | Two-layer approach: outer container prevents horizontal overflow on any screen; smaller cells (32px → 320px board) on sub-640px viewports ensure fit in 360px. `overflow-auto` handles edge cases where content still exceeds viewport. | 2026-11-18 |
| 34 | Colorblind indicator in cells | Small number text vs icon/symbol vs pattern overlay | **Small owner number (`<span class="text-[10px] text-black/60">`)** | Cells are 40×40px (32px on mobile), too small for patterns or initials. A translucent number overlays the colored background without obscuring it, readable against all 4 player colors. | 2026-11-18 |
| 35 | Reduced-motion strategy | CSS `@media (prefers-reduced-motion)` vs Tailwind `motion-reduce:` prefix | **Tailwind `motion-reduce:` prefix** | Tailwind v4 natively supports `motion-reduce:` variant prefix that applies classes only when the user's OS accessibility setting requests reduced motion. Cleaner than manual media queries. | 2026-11-18 |
| 36 | Seat ID convention on the wire | Mixed (some payloads 0-based, some 1-based) vs 0-based everywhere vs seat objects | **0-based seats in every payload** (`youSeat`, `activeSeat`, `winnerSeat`, seat-keyed `scores`/`piecesRemaining`); DO storage keeps 1-based engine keys per decision 24 | Every M4 identity bug came from mixing the two. One conversion at the payload builder is testable; `youSeat` replaces the ambiguous `playerId`/`playerPosition` pair, and `winnerSeat` removes the off-by-one in the UI. | 2026-11-19 |
| 37 | Broadcast personalization | One shared payload with viewer fields (current) vs per-socket payloads vs viewer fields only in direct messages | **Per-socket payload built from the socket's attached session** | Four players plus a few tabs is a trivial fanout; it removes the class of bugs where a client adopts the actor's seat, and keeps one code path for snapshots and broadcasts. | 2026-11-19 |
| 38 | Error envelope for validation | Zod default body vs custom `defaultHook` | **`{ error: { code: 'INVALID_REQUEST', message } }` from a `zValidator` hook** | Matches decision 21 and the client's `ApiError`; no parser-dependent shapes reach the UI. | 2026-11-19 |
| 39 | Client recovery strategy | Infer staleness from versions vs explicit `resync` | **Explicit `resync` message on open/reconnect/after a rejected mutation** | Version comparison plus one global counter already dropped the first snapshot; an explicit request is unambiguous and cheap. | 2026-11-19 |
| 40 | Disconnect handling | Free the seat on socket close vs grace period vs explicit leave only | **~30 s grace alarm, cancelled by any reconnect; explicit Leave frees immediately** | A reload is a normal action; pausing the game on F5 makes the game unplayable. Grace keeps crash recovery without zombie seats. | 2026-11-19 |
| 41 | Deterministic dice for tests | Seed the whole RNG vs dev-only dice queue vs mock the module | **Dev-only dice queue binding + `POST /dev/room/:id/dice`, 404 outside development** | Full-game E2E needs known rolls; a queue is reviewable, leaves `rollDie` pure, and cannot exist in production. | 2026-11-19 |
| 42 | E2E tool | Manual two-browser checks vs Playwright vs MCP browser | **Playwright `@playwright/test`, two isolated contexts** | Reproducible, runs headless in CI, gives traces/screenshots as agent-readable artifacts, and needs no desktop interaction. | 2026-11-19 |
| 43 | E2E selector strategy | Tailwind classes vs text vs `data-testid` | **`data-testid` contract documented in `docs/VERIFICATION.md`** | Class names change during the M5 design pass; test IDs keep the suite stable through a redesign. | 2026-11-19 |
| 44 | Ownership of a re-filled seat | Reset the seat's score/supply vs inherit it | **The replacement occupant inherits the seat's score and remaining pieces** | Keeps scoring continuous and matches shared-colour 2-player rules; resetting would corrupt the board's owner encoding for cells already placed. | 2026-11-19 |
| 45 | Design token location | Inline per-component colors vs Tailwind v4 `@theme` in `app.css` | **`@theme` tokens plus one `playerColorClasses` helper** | Tailwind v4 supports tokens natively; one source of truth for the four player colors, used by both the board encoding and the UI legend. | 2026-11-19 |

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
