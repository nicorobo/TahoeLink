---
description: Implement one PLAN.md task with tests, verification, and a handoff
argument-hint: "<task-id> [extra constraints]"
---
Read AGENTS.md, PLAN.md, docs/HANDOFF.md, and the files relevant to the task.

Task: ${1:-the next unchecked P0 task in PLAN.md}
Extra constraints: ${@:2}

Workflow:

1. Restate the task's acceptance criteria and the files you expect to touch.
2. If this changes the rules engine, write a failing test in `packages/shared` first.
3. Make the smallest change that satisfies the task. Do not refactor unrelated code, add
   dependencies, or invent game rules. If a rule is missing, stop and ask.
4. If the wire contract changes, update `packages/shared/src/events.ts` before producers
   and consumers.
5. Validate all user input server-side and keep room mutations atomic.
6. Run the checks in AGENTS.md §3 and exercise the affected flow yourself.
7. Update PLAN.md checkboxes and add a decisions-log entry for any non-obvious choice.
8. Rewrite docs/HANDOFF.md following the format in `.pi/prompts/handoff.md`.

Do not commit or push unless I explicitly ask.

Final report: task ID, files changed, commands run with exit codes, what you verified
manually, what you could not verify, and the next task.
