# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-18 (session 13 — M4-11 Spectator + M4-12 Empty/edge states)
- Branch: `orchestrate-M4`
- Tasks completed this session: **M4-1** ✅, **M4-2** ✅, **M4-3** ✅, **M4-4** ✅, **M4-5** ✅, **M4-6** ✅, **M4-7** ✅, **M4-8** ✅, **M4-9** ✅, **M4-10** ✅, **M4-11** ✅, **M4-12** ✅
- Current milestone: **M4 — COMPLETE** ✅

To resume: read `AGENTS.md`, then run `/task M5-1` or another PLAN task;
use `/verify` before committing and `/handoff` at the end of the session.

## What changed this session

| Task | Change | Files |
|------|--------|-------|
| M4-6 | Added StatusPanel component showing die result (large), active player indicator, "Your turn!" prompt (animated), per-player scores + pieces remaining, color legend, and game-over banner with winner. Extended `roomState` with `scores`, `winner`, `piecesRemaining` fields; propagated through SSR, WebSocket `state` and `game-over` handlers. Added `piecesRemaining` to `StatePayload` and DO's `buildStatePayload`/`handleGetRoom`. | `StatusPanel.svelte` (new), `state.svelte.ts`, `events/index.ts`, `+page.ts`, `+page.svelte`, `room-do.ts`, `shared/src/events.ts`, `PLAN.md`, `docs/HANDOFF.md` |
| M4-7 | Added paused overlay (semi-transparent backdrop, "Game Paused" card, per-seat connection status) and winner/complete overlay ("Game Over!" heading, winner announcement with color dot, final scores list, "New Game" button that creates a new room and redirects). Restructured stage conditional to show game screen underneath overlays for `paused` and `complete` stages. | `+page.svelte`, `PLAN.md`, `docs/HANDOFF.md` |
| M4-9 | Board scaling: added `max-w-full overflow-auto` container, `max-sm:w-8 max-sm:h-8` cells (32px on <640px). PieceDisplay cells match. Controls stack below board via existing `flex flex-col md:flex-row`. Touch targets: `min-w-[44px] min-h-[44px]` on PieceControl buttons. Refined responsive gap/padding on room page. | `Board.svelte`, `PieceDisplay.svelte`, `PieceControl.svelte`, `+page.svelte`, `PLAN.md` |
| M4-10 | Board cell `aria-label` describing position/owner; `aria-live="polite"` wrapping status panel; `focus-visible:ring-2 focus-visible:ring-blue-500` on board cells + PieceControl buttons; `motion-reduce:animate-none` on "Your turn!" pulse + toast animation; colorblind-safe owner number (`<span class="text-[10px] text-black/60">`) in each cell. | `Board.svelte`, `StatusPanel.svelte`, `PieceControl.svelte`, `Toast.svelte`, `PLAN.md` |
| M4-11+M4-12 | **Spectator mode**: PieceControl hidden for unseated players, spectating indicator shown. **Empty/edge states**: `+page.ts` returns `loadError` on fetch failure (404/network error); error screen with "Room Not Found" heading, home link, and "Create New Room" button. Join errors (ROOM_FULL → "Room is full", GAME_IN_PROGRESS → "Game already in progress; you can spectate") shown as toasts via `addToast` in `PlayerSelectionScreen`. Toast.svelte imported and rendered in room page. | `+page.ts`, `+page.svelte`, `PlayerSelectionScreen.svelte`, `PLAN.md`, `docs/HANDOFF.md` |

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bunx tsc --noEmit` | clean |
| `cd packages/api && bunx tsc --noEmit` | clean |
| `cd packages/app && bun run check` | **0 errors, 0 warnings** |
| `cd packages/shared && bun test` | **182 pass, 0 fail** |
| `cd packages/app && bun run build` | built |

## Not verified / known gaps

- **WebSocket handshake** not tested end-to-end (needs both `wrangler dev` and `bun run dev`)
- **Keyboard bindings** not tested in browser
- **Responsive layout** not tested on actual 360px viewport
- All gaps from previous sessions remain (alarm heartbeat, multi-tab, stale version, 3-player)

## M4 — Complete

All 12 tasks under M4 are done. The game screen, lobby, controls, status panels, overlays, error handling, responsive layout, accessibility, spectator mode, and edge cases are all implemented. Remaining gaps are all integration-level (end-to-end testing with running servers).

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 (session 8) — orchestrate M4 run

**M4-1** — App shell + WebSocket:
- Replaced SSE EventSource with native WebSocket to `/ws/room/:id`
- Added room header: home link, room ID (monospace), copy-invite-link button, connection status indicator
- Added `/ws` → `http://localhost:3000` with `ws: true` to Vite dev proxy
- Connection status lifecycle via local `$state<'connected'|'disconnected'|'reconnecting'>`
- Auto-reconnect on close with 3s delay

**M4-2** — Lobby with seat cards:
- Refactored `PlayerSelectionScreen.svelte` into a proper lobby
- Added `seats` to `roomState` and propagated through SSR load + WebSocket state handler
- 4 seat cards in a 2×2 grid, each with player color header, join/leave button, occupied/empty label
- Start Game button visible when seated, enabled at ≥2 players
- Rules link (external — ultraboardgames.com)
- Spectator count placeholder with TODO

**M4-3** — Compose game screen from existing board/piece components:
- Replaced `<div>Game Screen</div>` with Board, PieceDisplay, PieceControl + inline player info
- Board wired to `makeMove(col)`, `makeMove` parameter changed from `cell` to `column`
- Removed unused `onJoin` function, removed PlayerStatus/JoinButtons references (legacy SSE)
- Game screen visible on `in-progress` or `complete` stages

**M4-4** — Placement preview: ghost piece + illegal column highlighting:
- Restructured Board.svelte from CSS Grid to flexbox layout for column-level hover tracking
- Added `shape`, `legalColumns`, `playerId` props to Board
- Ghost piece: computed via `tryPlacePiece` on hover; cells shown in player color with `opacity-30`
- Illegal columns: dimmed with `opacity-50` on the column wrapper
- New `ghostCellSet` derived state reactively updates on hover/board/shape changes
- `+page.svelte`: computes `currentShape` (via `getShape`) and `legalCols` (via `getLegalColumns`)
- **Decision**: imported `tryPlacePiece` directly in Board.svelte rather than pre-computing ghost cells in the parent, for simpler reactive updates on hover
- Click (`onClick`) behavior unchanged

Next: **M4-6** (any remaining task) from the orchestrate workflow.

### 2026-11-16 (session 9) — M4-5 Controls

**M4-5** — Controls: rotate left/right, flip, keyboard bindings, shape restriction:
- Fixed rotation buttons: left now decrements (`pieceState.rotation -= 1`), right increments
- Added missing `Z` to the shape buttons list (was `['L','O','S','T','I']`, now `['L','O','T','I','S','Z']`)
- PieceControl accepts `legalShapes: Shape[]` prop (computed via `legalShapesForDie(roomState.roll)` in `+page.svelte`)
- Disabled shape buttons not in `legalShapes` with `opacity-50` + `cursor-not-allowed` + disabled attribute
- Auto-selects first legal shape when current shape becomes illegal
- Keyboard bindings on the PieceControl container: Left/Right arrows for rotation, R/F for flip, 1–6 for shape selection
- Keyboard handler only active when `roomState.stage === 'in-progress'`
- `role="region"` with `aria-label` on PieceControl container for a11y