# AGENTS.md — TahoeLink

Operating manual for coding agents. Read [README.md](./README.md) for setup,
[docs/HANDOFF.md](./docs/HANDOFF.md) for the current state, and [PLAN.md](./PLAN.md) for the
task queue. Use `.pi/skills/tahoe-verify/SKILL.md` before committing. Keep this file short:
long reference belongs in `PLAN.md`, `docs/`, or a skill.

Last verified: 2026-11-16, Bun 1.4.4, macOS. Docker, Redis, and mkcert are not installed.

## 1. Project

Multiplayer web implementation of **Tetris Link**: 2–4 players share a 10×10 board, roll a
tetromino die, and drop matching pieces into columns. Scoring is based on links between
same-color pieces. All confirmed rules are codified in [docs/GAME_RULES.md](./docs/GAME_RULES.md).

The server is authoritative. The client renders state and sends intents. `shared` is pure
TypeScript, `api` is Hono + Durable Objects, `app` is SvelteKit (Svelte 5) + Tailwind.

## 2. Definition of done

1. `cd packages/app && bun run check` passes.
2. `cd packages/shared && bun test` passes; engine behavior has tests.
3. No new browser console errors or server stack traces in the affected flow.
4. The flow was exercised end-to-end (two browser contexts for multiplayer) and, once M4.6
   lands, `bun run test:e2e` passes. Typecheck output alone is **not** evidence.
5. `PLAN.md` checkboxes and the decisions log are updated.
6. `docs/HANDOFF.md` reflects what changed, what was verified, and what is next.
7. No unrelated refactors, formatting churn, or dependency additions.

If something cannot be verified (no Docker, no rulebook), say so instead of claiming success.

## 3. Commands

Probe first: `command -v bun curl jq wrangler`

Wrangler dev (current workflow — M2+):

```bash
# Terminal 1: API (Worker + Durable Objects via miniflare)
cd packages/api && bunx wrangler dev
# Terminal 2: SvelteKit dev server
cd packages/app && bun run dev
# UI:  http://localhost:5173
# API: http://localhost:3000 (via wrangler dev) or 8787 (default wrangler)
# No Docker, no Redis, no nginx
```

Checks:

```bash
cd packages/app && bun run check
cd packages/app && bun run build
cd packages/shared && bunx tsc --noEmit -p tsconfig.json
cd packages/api && bunx tsc --noEmit -p tsconfig.json
cd packages/shared && bun test
cd packages/api && bun test             # DO lifecycle tests (needs wrangler dev)
```

Current baseline: all typechecks pass; shared 182 tests pass; API lifecycle tests pass
(start wrangler dev first). macOS has no GNU `timeout`; use a background terminal or
`perl -e 'alarm shift; exec @ARGV' 10 ...`.

**Not available yet:** browser E2E. `docs/VERIFICATION.md` defines the harness built in
M4.6 (`bun run test:e2e`); until then, every UI claim needs a manual two-context pass or
`scripts/dev-play.ts` (M4.6-6). The API/DO tests are the only automated guard for the wire
contract.

Probes:

```bash
curl -s localhost:3000/health
curl -s -X POST localhost:3000/create-room
curl -s localhost:3000/room/<roomId>   # GET room state
```

Full verification, smoke tests, and troubleshooting live in
`.pi/skills/tahoe-verify/SKILL.md`.

## 4. Architecture map

| Shared (`packages/shared`) | Responsibility |
| --- | --- |
| `src/types.ts` | `Board`, `Shape`, `DiceValue`, `RoomStage`, `Room` |
| `src/constants.ts` | 10×10 board; `MIN_PLAYERS=2`, `MAX_PLAYERS=4` |
| `src/events.ts` | `EventName` + payload map — the wire contract |
| `game-mechanics/shapes.ts` | `shapes[shape][rotation][flip]` |
| `game-mechanics/board.ts` | `getDefaultBoard`, `getUpdatedBoard` (gravity) |

| API (`packages/api`) | Behavior today |
| --- | --- |
| `POST /create-room` | Random ID → DO init; no collision check |
| `POST /room/:id/join` | DO assigns seat; idempotent rejoin |
| `POST /room/:id/leave` | DO frees seat; broadcasts update |
| `POST /room/:id/start` | DO sets `in-progress`; 2-player min check |
| `POST /room/:id/turn` | DO increments turn (stub — no validation) |
| `GET /room/:id` | DO returns state + seats + player position |
| `GET /ws/room/:id` | WebSocket upgrade → DO Hibernation API |
| `GET /health` | Status + timestamp |

**Durable Objects** replace all Redis state: DO `RoomDurableObject` stores seats, board,
stage, turn, roll, scores via SQLite-backed `ctx.storage`. WebSocket (Hibernation API)
replaces SSE for real-time; fanout via `ctx.getWebSockets()`.

App entry points: `src/lib/api.ts` (client), `state.svelte.ts` (module-level
`$state`), `events/` (WebSocket event handlers), `routes/room/[roomId]/` (lobby; game
screen is a placeholder). `Board`, `PieceDisplay`, `PieceControl`, `PlayerStatus`, and
`JoinButtons` exist but are **unused**.

## 5. Invariants

1. **Board is column-major**: `board[x][y]`, `x=0` left, `y=0` top, empty `-1`. Owner is
   `Math.floor(cell)`. Do not change the encoding without updating the color helper and
   adding versioning.
2. **Shapes are column-major**: `shape[x][y]`; `1` block, `0` empty. Every column in one
   orientation has equal length; the drop math depends on it.
3. **Gravity**: for each shape column, `shapeDepth` is the lowest block's signed offset
   from the shape's bottom row. Landing row `y = min(topmostOccupiedY - shapeDepth)`; draw
   from `y - shapeHeight`. `getUpdatedBoard` is correct only for in-bounds placements that
   do not overflow the ceiling.
4. **Legality precedes mutation**: in-progress room, sender is the active player, shape
   matches the roll (or `any`), every destination cell in bounds and empty. None of this is
   enforced today.
5. **`activePlayer` is a seat ID (0–3), not a list index.** List order can change on leave.
6. **Turn order** = join order in `players:<id>`, skipping empty seats. Define what happens
   when the active player leaves; test it.
7. **Server is authority.** Never accept a board, score, roll, or winner from the client.
8. **Wire types live in `shared/src/events.ts`.** Change the type before producers and
   consumers; payloads must match exactly (two mismatches exist today).
9. **`shared` stays pure**: no `node:*`, Bun, Redis, Hono, Svelte, DOM, or `$app` imports.
10. **Room mutations must be atomic.** Read-modify-write is unsafe. Use Lua, `WATCH/MULTI`,
    a per-room lock, or a single writer (Durable Object). Two moves cannot both apply.

## 6. Known P0 landmines

Full backlog, including P1/P2, is in `PLAN.md` § Defect backlog.

| Defect | Where | Status |
| --- | --- | --- |
| Placement throws past the right edge; ceiling overflow silently loses cells | `shared/src/game-mechanics/board.ts` | Fixed in M1-2 (tryPlacePiece) |
| No turn ownership, dice roll, shape validation, or active-player advance | DO `handleTurn` | M3-5 target |
| No scoring, piece supply, end condition, or winner on server | DO state (engine done in shared) | M3-5 target |
| No game UI; board/piece components unused | `app/src/routes/room/[roomId]/+page.svelte` | Built in M4, **broken end-to-end** |
| M4 loop defects: error body assigned as state, seat identity leaked in broadcasts, lobby never syncs, paused games never resume, winner off by one | `room-do.ts`, `app/src/lib/**` | **M4.5 target** — PLAN D19–D29 |
| No browser/E2E verification; M4 was signed off on typecheck and build only | repo | **M4.6 target** — see `docs/VERIFICATION.md` |
| Room mutation not atomic | `api/src/models/room.ts` (deleted) | **Resolved** — DO single-writer |
| No Vite `/api` proxy; SSR hardcodes `http://api:3000` | M0-1 | **Resolved** |
| Always-`Secure` cookie for plain HTTP | M0-2 | **Resolved** |

## 7. Workflow

1. Pick exactly one `PLAN.md` task and restate its acceptance criteria.
2. Engine changes are test-first: failing test with a board fixture, then fix.
3. Wire type first, then server, then client.
4. Keep the diff narrow; no renames, upgrades, or reformatting as a side effect.
5. Validate at the boundary with Zod; return structured errors; re-check server-side.
6. Make the mutation atomic or explicitly note the race; do not claim correctness.
7. Run the checks and exercise the flow with two browser contexts.
8. Update `PLAN.md`, the decisions log, and `docs/HANDOFF.md`; then commit.

Commits: small and imperative (`fix: reject placements past column 9`). Never commit
`localhost.crt/key`, `node_modules`, `.svelte-kit`, `.wrangler`, or Redis dumps.

UI: Svelte 5 runes only; one source of truth for the board; `BOARD_WIDTH/HEIGHT` instead of
literals; label all 100 board cells; show a legal-placement preview; Tailwind only; scale the
board down to 360 px.

## 8. Testing

| Layer | Tool | Cover |
| --- | --- | --- |
| Engine | `bun test` in `packages/shared` | placement, gravity, legality, scoring, win, seeded dice |
| Server | `bun test` + `SELF.fetch()` + DO binding | join/start/turn/leave, auth, 4xx, reconnect |
| Realtime | Playwright, two contexts | broadcasts, reconnect, pause/resume |
| Fuzz | seeded loop | no overlap/floating/out-of-bounds; games terminate |

Assert after random moves: occupied cells in bounds, owners never change, no floating cells
(unless the rulebook allows overhangs), score derivable from the board.

## 9. Agent operating model

- One deliverable per session. Start with `/task <PLAN-id>`, finish with `/handoff`; run
  `/verify` before committing. New task or stale context → new session; do not drag a
  half-finished branch across unrelated work.
- One Pendant goal per milestone when the user asks (objective + task tree + verification
  contract + budget). Never create a goal unilaterally.
- Subagents: `explore` (map code, no edits), `plan` (design/test list), `general-purpose`
  (bounded isolated implementation), `verifier` (checks only), `reviewer` (fresh diff
  review). They share the cwd: never run two editors concurrently, and ask for terse reports
  (≤300 words) because their output still enters the parent context.
- Use `codemode` for batched reads/greps filtered to the relevant lines, and background
  terminals for servers. Avoid dumping whole files or raw test logs.
- Prompt templates: `/task`, `/handoff`, `/verify` in `.pi/prompts/`. Skill:
  `/skill:tahoe-verify`. Create `tahoe-rules` after R1–R12 are confirmed and `tahoe-deploy`
  before M6.
- Optional integrations: Playwright MCP for two-browser E2E, Context7 for current
  SvelteKit/Hono/Wrangler docs, Cloudflare MCP servers for deployment. Keep credentials in
  `~/.pi/agent/mcp.json`, not the project file.
- Antipatterns: “execute the whole plan”; engine+server+UI in one run; inventing rules;
  client-side board/score; catching `getUpdatedBoard` errors instead of validating; deploying
  without approval.

## 10. Deployment

Deployment choice **B (Durable Objects)** was recorded in `PLAN.md` on 2026-11-14.
The DO migration happens in **M2** (foundation) and **M3** (state machine on DO).
M6 handles Cloudflare configuration, CI/CD, and the production launch. See
[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the architecture diagram, Wrangler config,
DO skeleton, and production checklist.

## 11. Do not

- Commit secrets, certificates, `.dev.vars`, or Cloudflare tokens.
- Make the session cookie non-`httpOnly`, or permanently disable `Secure`.
- Log full session IDs.
- Break `shared` purity or the column-major conventions.
- Edit generated `.svelte-kit/` files or run `bun install` inside a package.
- Mark a task complete without command output and a manual flow check.
