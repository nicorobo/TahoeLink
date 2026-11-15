# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-19 (session 14 — post-M4 audit and forward plan; **docs only, no code**)
- Branch: `orchestrate-M4`
- M4 (M4-1…M4-12) is marked done in session 13, but **the game is not playable**.
- Queue: **M4.5 (fix the loop) → M4.6 (verification harness) → M5 (UX/visual) → M6 (deploy)**.
- Next task: `/task M4.5-2` (stop treating error responses as state), then `M4.5-4`.
- Do not start M5 before M4.6 exists.

Use `/verify` before committing and `/handoff` at the end of the session.

## What changed this session

No code. Added a plan and a verification contract, and recorded what is actually broken.

| File | Change |
| --- | --- |
| `PLAN.md` | New **M4.5** (P0 hardening), new **M4.6** (Playwright harness), rewritten **M5** (UX/visual/playtest); defects D19–D33 with file-level evidence; decisions 36–45; current-state line fixed; next-session queue replaced the stale M0/M1 order |
| `docs/VERIFICATION.md` | New: harness topology, determinism (dev dice queue), `data-testid` contract, spec→defect map, failure triage, browser-free fallback |
| `AGENTS.md` | Definition of done requires exercised flows + `test:e2e`; §6 landmines updated to the real M4 state |
| `.pi/skills/tahoe-verify/SKILL.md` | Green checks no longer imply a working game; E2E marked unavailable until M4.6 |

## Diagnosis (reproduced with a scripted two-client probe against `wrangler dev`)

| Observed | Root cause | Task |
| --- | --- | --- |
| A rejected move blanks/crashes the page | `makeMove` assigns `res.roll/board/stage` without `res.ok`; an error body has none of them | M4.5-2 |
| Both players render red; a spectator reports being Player 1 | `handleStart`/`handleTurn` build one payload from the actor's session and broadcast it; clients adopt `playerPosition >= 0` | M4.5-1 |
| Lobby never updates when someone joins | join broadcasts `player-joined {playerIds}` only; handlers never update `seats` | M4.5-3 |
| First socket snapshot dropped; cold DO sends none | `connected` seeds `lastStateVersion`; `ensureLoaded()` is fire-and-forget in the upgrade | M4.5-3 |
| Rotate-left then place → 400 `ZodError` | rotation is decremented without normalization and sent verbatim | M4.5-4 |
| Non-active player can click the board | no `disabled` prop, no `isMyTurn` gate | M4.5-4 |
| Paused game can never resume | only `handleStart` sets `in-progress` | M4.5-5 |
| Wrong winner announced | `getWinner` is 1-based; UI renders `winner + 1` and `PLAYER_COLORS[winner]` | M4.5-6 |
| Gap-seat room returns `NO_PIECES` | supply/scores keyed by join order (`i + 1`), not seat | M4.5-6 |

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bunx tsc --noEmit` | clean (unchanged) |
| `cd packages/api && bunx tsc --noEmit` | clean (unchanged) |
| `cd packages/app && bun run check` | 0 errors, 0 warnings (unchanged) |
| `cd packages/shared && bun test` | 182 pass, 0 fail (unchanged) |
| Two-client + spectator probe (HTTP/WS, no browser) | reproduced the defects above; server does enforce turn order (`NOT_YOUR_TURN` is correct) |

## Not verified / known gaps

- **No browser flow has ever been run.** No Playwright, no E2E, and no automated UI check.
- Rotation, keyboard bindings, responsive layout, and reconnect are untested in a browser.
- Multi-tab, 3–4 player games, heartbeat resync, and the S/Z selection flow are untested.
- Playwright browsers are not installed on this machine (M4.6-1 documents the install).

## Environment

- Bun 1.4.4, macOS. Docker, Redis, and mkcert are **not installed**.
- API: `cd packages/api && bunx wrangler dev` (port 8787). Web: `cd packages/app && bun run dev`.

## Session log

### 2026-11-19 (session 14) — audit + plan

- Reproduced the M4 defects with `/tmp` probes (two cookie sessions + a spectator over WS).
- Wrote `PLAN.md` § M4.5 / M4.6 / M5, `docs/VERIFICATION.md`, defect rows, and decisions.
- Recommendation stands: fix the contract bugs first, then build the E2E net, then design.

### 2026-11-18 (session 13) — M4 UI declared complete

- Built the lobby, game screen, board preview, controls, status panel, overlays, responsive
  and a11y passes, spectator mode, and edge states (M4-1…M4-12). Detail in git.
- Sign-off was based on typecheck/build only; the browser flow was never exercised.
