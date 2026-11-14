---
description: Delegate all unchecked tasks in a milestone to subagents, one at a time
argument-hint: "<milestone-id|task-ids> [extra constraints]"
---
Read `PLAN.md`, `AGENTS.md`, and `docs/HANDOFF.md`.

Target: ${1:-the first milestone with unchecked tasks}
Extra constraints: ${@:2}

## 1. Plan

List every unchecked task under the target milestone. Show the user the list and
confirm they want to proceed. If they give specific task IDs instead, use those.

## 2. Setup

If there is unstaged work, stage it, commit as "wip: snapshot before <milestone>",
and create a branch named `orchestrate-<milestone>`.

## 3. Process each task — one at a time, via subagent

For each unchecked task, in PLAN.md order:

### a. Prepare

Reread the task's description, acceptance criteria, and any linked file paths from
PLAN.md so you can write a precise delegation.

### b. Delegate

Call `pendant_agent` with:
- kind: `"new"`
- profileId: `"general-purpose"`
- context: `"fresh"`
- background: `false` (sequential — each task must finish before the next starts)
- name: the task ID (e.g. `"M4-1"`)

The `task` string must be self-contained (≤ 60000 chars). Include:

1. **Task**: The exact task ID and description from PLAN.md.
2. **Acceptance criteria**: Copy the acceptance criteria verbatim from PLAN.md.
3. **Project rules** (abbreviated):
   - Column-major board `board[x][y]`, empty = -1, owner = Math.floor(cell).
   - `shared` stays pure (no `node:*`, Bun, Hono, Svelte, DOM).
   - Server is authority — never trust client board/score/roll.
   - DO single-writer: room mutations are atomic by design.
   - `Agents.md` §5 (invariants) and §2 (DoD) apply.
4. **Workflow**:
   - Read relevant source files first. If changing the rules engine, write a
     failing test in `packages/shared` first.
   - Make the smallest change that satisfies the task. No refactors, no
     dependency additions, no unrelated formatting.
   - Wire-contract changes: update `shared/src/events.ts` before producers or
     consumers.
   - Validate all user input server-side.
5. **Checks to run**:
   ```bash
   cd packages/shared && bunx tsc --noEmit -p tsconfig.json
   cd packages/api && bunx tsc --noEmit -p tsconfig.json
   cd packages/app && bun run check
   cd packages/shared && bun test
   cd packages/api && bun test           # needs wrangler dev on :8787
   ```
6. **Bookkeeping**: Update the PLAN.md checkbox (change `[ ]` to `[x]`). Add a
   decisions-log entry for non-obvious choices.
7. **Do NOT** create a new branch, commit, or push.
8. **Report** (≤ 300 words): task ID, files changed, commands run with exit codes,
   what you verified manually, what you could not verify, any blockers. If blocked,
   say so clearly and stop.

### c. Process the report

The subagent runs synchronously (background: false). Read its full output.

- If it reports a blocker: stop the loop, show the user the blocker and the
  partial report, and ask how to proceed.
- Otherwise: add a short entry to `docs/HANDOFF.md` with the task ID, what
  changed, and the key verification result.

## 4. Finalise

1. Verify every target checkbox is now `[x]` in PLAN.md (unless blocked).
2. Update `docs/HANDOFF.md`: set the new end state, update the date, and add a
   session summary.
3. Show the user a results table:

   | Task | Result | Files changed | Key notes |
   |------|--------|---------------|-----------|
   | M4-1 | ✅ | ... | ... |
   | M4-2 | ⬜ blocked | ... | reason |

4. If any task was blocked, list the blocker and what the user should do next.

Do not commit or push unless asked.

**Final report**: task IDs processed, overall status, any blockers, and the next
step for the user.