# PLAN.md — Road to playable

This is the task queue and design record for TahoeLink. Work one task at a time, tick the
box, and record non-obvious decisions at the bottom. `AGENTS.md` contains the invariants and
verification commands that apply to every task; `docs/HANDOFF.md` contains the current state.

Use the agent commands from `.pi/prompts/`: `/task <id>` to implement one task, `/verify`
for a verification pass, and `/handoff` to write the state back to `docs/HANDOFF.md`. One
deliverable per session; one Pendant goal per milestone (when the user asks for it).

Current state: **pre-alpha**. Lobby join/leave works; the game is not playable.

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

The repo implements the board and pieces but **not the rules**. Confirm the following from
the physical rulebook (or an official source) before M1 scoring work. Until then, tests may
cover mechanics but must not encode guessed scoring.

### Confirmed by the code (mechanics only)

| Rule | Implementation |
| ---- | -------------- |
| 10×10 board, column-major | `shared/src/constants.ts`, `types.ts` |
| 5 tetrominoes: L, O, S, T, I | `shared/src/game-mechanics/shapes.ts` |
| 4 rotations + mirrored variant | `shapes[shape][rotation][flip]` |
| Pieces drop vertically into a column | `getUpdatedBoard` (in-bounds only) |
| 2–4 players | `MIN_PLAYERS`, `MAX_PLAYERS` (unused so far) |
| Die can roll a shape or `any` | `DiceValue` (type only; no roller) |

### Must be confirmed (blocking M1)

| # | Question | Why it matters |
| - | -------- | -------------- |
| R1 | Exact die faces: one each of L/O/S/T/I plus one `any`, or a different distribution? | `rollDie` + tests |
| R2 | How many pieces does each player start with? | piece supply, end condition |
| R3 | Scoring: points per link size? Is a "link" orthogonal only, or do diagonals count? Can one piece belong to multiple links? | `scoreBoard` |
| R4 | Do opponent-adjacent pieces block a link, score negatively, or do nothing? | `scoreBoard` |
| R5 | Bonus for a completed row ("Tetris"), board edge, or largest link? | `scoreBoard` |
| R6 | Is flipping/mirroring a piece legal on every turn, or only for certain die results? | move validation + UI |
| R7 | If no column can accept the rolled piece, does the player skip, reroll, or does the game end? | turn state machine |
| R8 | Does the game end when pieces run out, when the board is full, or when no one can move? | end condition |
| R9 | Tie-breaker? | winner display |
| R10 | Who goes first, and does play proceed in seat order? | `startGame` |
| R11 | Are unused pieces scored at the end (or negative)? | final score |
| R12 | May a player choose `any` shape freely, including rotation/mirror? | validation + UI |

**Do not let an agent guess these.** If the rulebook is unavailable, implement mechanics and
leave scoring behind a clearly named, unexported stub.

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

---

## Milestones

Effort labels are rough: S ≈ hours, M ≈ a day, L ≈ several days.

### M0 — Runnable baseline (S–M)

**Goal:** one command starts the app locally without Docker, and checks are green.

- [ ] **M0-1** Add a Vite dev proxy for `/api` → `http://localhost:3000` (strip `/api`), and
      replace the hardcoded SSR base. Recommended: disable SSR for the room route
      (`export const ssr = false` in `+page.ts` or `+layout.ts`) so `API_BASE` is always
      `/api`; keep an env override for split deployments.
- [ ] **M0-2** Derive cookie `Secure` from `X-Forwarded-Proto` (proxy) or an env flag, so
      HTTP localhost works while production stays secure.
- [ ] **M0-3** Support `REDIS_URL` and/or default `REDIS_HOST` to `localhost` outside Docker;
      document both. Fix `packages/api/.env.development`.
- [ ] **M0-4** Fix the 4 type-only imports in `packages/shared` so `bun run check` passes.
- [ ] **M0-5** Add root scripts: `dev`, `dev:api`, `dev:web`, `check`, `test`; add a `test`
      script to `packages/shared`. Document the native workflow.
- [ ] **M0-6** Add `.env.example` files and update `README.md`; delete/replace the stale
      `packages/app/README.Docker.md`; remove the stray `packages/shared/bun.lock`.
- [ ] **M0-7** Add GitHub Actions: `bun install`, shared typecheck, `bun test`,
      `bun run check` (allow the known-failing check to become required only after M0-4).
- [ ] **M0-8** Add a smoke script (`scripts/smoke.sh`) that starts the API, creates a room,
      joins, and asserts JSON — usable by agents and CI.

**Acceptance:** `bun install && redis-server & bun run dev` opens `http://localhost:5173`,
`/room/<id>` renders, create/join works, refresh keeps the seat, `bun run check` is clean,
CI is green. Docker path still works.

**Verification:** run the smoke script; manually create + join in two browser contexts;
`curl -s localhost:3000/health`.

---

### M1 — Rules engine in `shared` (M–L)

**Goal:** all game rules that do not need Redis or HTTP are pure, tested functions.

- [ ] **M1-1** Write the confirmed rules into `.pi/skills/tahoe-rules/SKILL.md` (or
      `docs/RULES.md`) with worked examples and expected scores.
- [ ] **M1-2** Add `tryPlacePiece({ board, column, shape }) => { board, cells } | null`.
      Reject: column out of range, any cell out of range, any occupied cell, ceiling
      overflow. Keep a thin throwing wrapper only if callers need it.
- [ ] **M1-3** Refactor `getUpdatedBoard` to use `tryPlacePiece`; preserve current correct
      gravity results. Document/enforce the "all shape columns have equal length" invariant.
- [ ] **M1-4** Add `getLegalColumns(board, shape): number[]` for the UI and server.
- [ ] **M1-5** Add `rollDie(rng: () => number): DiceValue` with an injectable RNG and the
      confirmed distribution; make `any` explicit.
- [ ] **M1-6** Add `scoreBoard(board, rules)` (or `getPlayerScore`) matching the rulebook.
      If scoring is board-derived, keep it pure so the server can always recompute it.
- [ ] **M1-7** Add piece supply: `piecesRemaining`, `canMove`, `isGameOver`, `getWinner`.
- [ ] **M1-8** Replace the `playerId + turn * 0.001` cell encoding with a stable one
      (e.g. `playerId * 1000 + turn` and decode with `Math.floor(cell / 1000)`), or switch
      to `{ owner, turn }` cells. Update `getCellBackgroundClass` and add a decode test.
- [ ] **M1-9** Tests: golden placement fixtures for every shape/orientation (left wall, right
      wall, stacked, ceiling), scoring fixtures, seeded-dice tests, and a seeded fuzz loop
      asserting bounds/overlap/floating invariants and game termination.

**Acceptance:** `cd packages/shared && bun test` covers every rule that does not need I/O;
no DOM/Bun/Redis imports; a seeded 1,000-game simulation always terminates without invalid
board states.

**Verification:** `bun test`; `bunx tsc --noEmit -p tsconfig.json`; inspect a dumped board
from the fuzz test.

---

### M2 — Server state machine (M–L)

**Goal:** the API is the single authority for a complete game.

- [ ] **M2-1** Standardize errors: `HTTPException` with `{ error: { code, message } }`;
      add a Hono `onError` handler; never leak stack traces in production.
- [ ] **M2-2** Room lifecycle: crypto room IDs (short, human-shareable), collision check,
      404 for unknown rooms, sliding TTL, `createdAt`/`updatedAt`.
- [ ] **M2-3** Make room mutations atomic: Lua script / `WATCH-MULTI` / per-room lock, or
      move the room into a single writer (see deployment decision). Test two concurrent moves.
- [ ] **M2-4** Join rules: stage check, seat availability, `MAX_PLAYERS`, idempotent rejoin
      for the same session, spectator handling, clear 4xx codes.
- [ ] **M2-5** Start: require `MIN_PLAYERS`, require an occupant, set turn order + first
      player, roll the die, transition stage, emit a full snapshot.
- [ ] **M2-6** Turn: verify active player, verify shape/rotation/flip/column against the
      roll and engine, apply the placement, recompute score, advance to the next occupied
      seat, roll the next die, detect game over, emit a snapshot.
- [ ] **M2-7** Leave/pause/resume per `packages/api/player-flow.txt`: free the seat, set
      `paused`, freeze turns, allow a replacement/rejoin, resume when full. Handle the
      active player leaving.
- [ ] **M2-8** Add a `GET /room/:id/state` (or include state in the existing GET) that is
      safe to poll and includes scores, supplies, legal columns, and `version`.
- [ ] **M2-9** API tests with `app.request()` and a disposable Redis DB: happy-path scripted
      game for 2 and 4 players, invalid moves, wrong turn, stale turn/version, leave/rejoin.

**Acceptance:** a scripted game from `POST /create-room` to a winner completes over HTTP;
invalid moves return 4xx with codes; two simultaneous moves cannot both apply; unknown
rooms 404; tests pass in CI.

**Verification:** `cd packages/api && bun test`; a `curl` walkthrough; `redis-cli` key dump.

---

### M3 — Realtime hardening (S–M)

**Goal:** clients converge after reconnects and network hiccups.

- [ ] **M3-1** Make `shared/src/events.ts` the single source of truth; fix `connected` and
      `participant-change` payloads; add `state` and `error` events.
- [ ] **M3-2** Send a full snapshot on SSE connect (and on demand), including a monotonically
      increasing `seq` or `version`; clients ignore older versions.
- [ ] **M3-3** Add a heartbeat/comment every 15–25 s (proxies and mobile networks drop idle
      streams) and clean up dead clients.
- [ ] **M3-4** Await broadcasts; isolate per-client failures; remove clients that fail twice.
- [ ] **M3-5** Decide how to fan out across API instances. Today's in-process
      `roomClients` map only works with one instance. Options: Redis pub/sub, sticky
      sessions, or a single writer/DO. Document the choice.
- [ ] **M3-6** Handle multiple tabs with the same session; make rejoin idempotent.
- [ ] **M3-7** Test: kill the API mid-game, sleep a laptop, reload the page, toggle offline;
      assert the client recovers the same board/score.

**Acceptance:** after any reconnect, each client shows the same board, active player, roll,
score, and stage; no duplicate moves; no stale UI.

**Verification:** Playwright two-context test with forced `EventSource` close; manual
`curl -N https://localhost/api/sse/room/<id>`.

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
      unnecessarily; measure SSE memory per room.
- [ ] **M5-5** Observability: structured logs (no session IDs), error reporting, basic
      metrics (rooms created, games finished).
- [ ] **M5-6** Browser matrix (Chrome/Safari/Firefox, iOS Safari) and a network-throttle pass.
- [ ] **M5-7** Finalize `.pi/skills/tahoe-rules` and keep it in sync with tests.

**Acceptance:** no P0/P1 defects open; 10 consecutive scripted games complete; mobile
playtest passes.

---

### M6 — Deploy (M–L, depends on the architecture decision)

- [ ] **M6-1** Choose the deployment option in `docs/DEPLOYMENT.md` and record it below.
- [ ] **M6-2** Add the SvelteKit adapter and production build for the chosen target.
- [ ] **M6-3** Provision state (managed Redis or Durable Object storage) and secrets.
- [ ] **M6-4** Configure custom domain, HTTPS, cookie domain/same-site, and CORS.
- [ ] **M6-5** CI deploy on `main` with preview deployments and a manual approval gate.
- [ ] **M6-6** Production smoke test: create/join/start/turn/reconnect from two devices.
- [ ] **M6-7** Set up logs/alerts, a rollback procedure, and a cost check.
- [ ] **M6-8** Write `docs/RUNBOOK.md`: deploy, rollback, rotate secrets, inspect rooms.

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
| D3  | P0 | No turn ownership / dice / shape validation / active-player advance | M2-5, M2-6 |
| D4  | P0 | No scoring, supply, end condition, winner | M1-6, M1-7 |
| D5  | P0 | Game UI absent; components unused | M4-3…M4-12 |
| D6  | P0 | Room mutation is not atomic | M2-3 |
| D7  | P1 | Event payload type mismatches | M3-1 |
| D8  | P1 | Leave mid-game does not pause/free the seat | M2-7 |
| D9  | P1 | No capacity/min-player/stage checks | M2-4, M2-5 |
| D10 | P1 | Unknown rooms return default; no TTL; weak IDs | M2-2 |
| D11 | P1 | No SSE snapshot/heartbeat/resync | M3-2, M3-3 |
| D12 | P1 | Broadcast only reaches one process; fire-and-forget | M3-4, M3-5 |
| D13 | P1 | Start button not wired; rotation bug; shape not locked | M4-2, M4-5 |
| D14 | P1 | Typecheck fails on shared type-only imports | M0-4 |
| D15 | P1 | `REDIS_URL` ignored | M0-3 |
| D16 | P1 | No tests/CI | M0-7, M1-9 |
| D17 | P2 | Cell encoding breaks at turn 1000 | M1-8 |
| D18 | P2 | Session IDs logged; CORS wide open; stale docs | M5-5, M6-4 |

### P1/P2 details

| ID | Detail | Where |
| --- | --- | --- |
| D7 | `connected` sends `{}` but the type requires `{ roomId }`; `participant-change` sends `{ message }` but the type requires `{ participants }` | `api/src/broadcasting/roomSSE.ts:49-54`, `shared/src/events.ts` |
| D8 | Leaving mid-game neither frees the list slot nor pauses the room; `unsetPlayer` deletes the seat key only | `api/src/main.ts:63-78` |
| D9 | No max-player/min-player/stage checks; `MIN_PLAYERS`/`MAX_PLAYERS` unused | `api/src/main.ts:44-91` |
| D10 | Unknown room IDs return a default room instead of 404; no TTL; no create collision check | `api/src/models/room.ts:31-38`, `api/src/main.ts:35-41` |
| D11 | No SSE heartbeat or snapshot/resync; a client that misses an event stays stale | `api/src/broadcasting/roomSSE.ts` |
| D12 | Broadcasts are fire-and-forget and only reach clients on the same process | `api/src/broadcasting/broadcastToRoom.ts` |
| D13 | `startGame()` and `/start` exist but the UI never calls them; both rotation buttons increment; shape is freely selectable | `app/src/lib/api.ts`, `app/src/routes/room/[roomId]/+page.svelte:37-43`, `app/src/lib/components/PieceControl.svelte` |
| D14 | Typecheck fails on shared type-only imports | `shared/src/events.ts:1`, `shared/src/game-mechanics/board.ts:2` |
| D15 | `REDIS_URL` is ignored; `REDIS_HOST` defaults to the Docker name | `api/src/redis.ts` |
| D16 | No tests, CI, or lint/format script | repo |
| D17 | Cell encoding `playerId + turn*0.001` breaks at turn 1000 and conflates owner/turn | `api/src/main.ts:111` |
| D18 | Session IDs logged; CORS wide open; stale `README.Docker.md`; stray `shared/bun.lock` | `api/src/broadcasting/*`, `app/README.Docker.md` |

---

## First agent session (recommended order)

Run each as a separate session with `/task <id>`, one commit per green task:

1. `/task M0-4` (typecheck) — small win, unblocks CI.
2. `/task M0-1`, `/task M0-2`, `/task M0-3` (native dev path) — verify create/join/refresh
   in two browsers at the end.
3. `/task M0-5`, `/task M0-8` (scripts + smoke test).
4. `/task M0-7` (CI).
5. `/task M1-2`, `/task M1-3` (safe placement + tests) — highest-value correctness fix.
6. `/task M1-4` (legal columns) — feeds the UI and server.
7. `/task M1-5`, `/task M1-6`, `/task M1-9` (dice + scoring + fixtures) — only after
   R1–R12 are answered.
8. `/task M2-1`, `/task M2-2`, `/task M2-3` (errors, lifecycle, atomicity).
9. `/task M2-4` … `/task M2-8` (full state machine + API tests).
10. `/task M3-2`, `/task M3-3` (snapshot + heartbeat), then `/task M4-3` … `/task M4-7`
    (the game screen).

Stop after each session, run `/verify`, review the diff, and run `/handoff` before
continuing.

---

## Decisions log

Record choices here with a date and a one-line rationale. Agents should add entries rather
than silently choosing.

| # | Decision | Options | Choice | Why | Date |
| - | -------- | ------- | ------ | --- | ---- |
| 1 | Deployment shape | Hybrid (CF web + hosted API/Redis) vs CF-native DO rewrite | TBD | Ship sooner vs single-platform; decide before M3/M6 | |
| 2 | SSR for game routes | SSR room page vs `ssr = false` | TBD — leaning `ssr = false` for `/room` | State is client-owned and SSE-driven; avoids dual API bases | |
| 3 | Room mutation atomicity | Lua, WATCH/MULTI, lock, single writer (DO) | TBD | Must prevent double moves | |
| 4 | Realtime transport | SSE vs WebSocket | TBD | SSE is simple on Bun/nginx; DO WebSockets are better on CF | |
| 5 | Cell encoding | `owner + turn*0.001` vs `owner*1000+turn` vs objects | TBD | Current encoding is fragile and conflates concerns | |
| 6 | Player identity | Cookie session vs signed token vs accounts | TBD — keep cookie for v1 | Lowest friction for a link-shared game | |
| 7 | Room code format | Random base36 vs crypto base32, length | TBD | Shareable + unguessable | |

---

## Non-goals for v1

- User accounts, profiles, friends, chat, matchmaking, rankings, or persistence across weeks.
- An AI opponent or solitaire mode.
- Spectator chat or streaming features.
- Native mobile apps.
- Microservices, Kubernetes, or a database other than Redis/DO storage.
- A custom rendering engine (DOM/Tailwind is enough for a 10×10 board).

---

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Rules ambiguity (R1–R12) | Scoring/tests may be wrong | Confirm before M1-6; keep rules in one skill file |
| In-process SSE fanout | Breaks with >1 API instance | Decide fanout in M3-5; single writer or Redis pub/sub |
| Cloudflare rewrite scope | Delays launch | Choose hybrid vs native before building SSE-specific features |
| Mobile SSE/proxy idle timeouts | Clients silently stop updating | Heartbeat + snapshot on reconnect |
| Read-modify-write races | Two moves overwrite each other | Atomic room mutation in M2-3 |
| Scope creep into accounts/chat | Never ships | Enforce non-goals |
