---
description: Write the current-state handoff into docs/HANDOFF.md
argument-hint: "[note]"
---
Update docs/HANDOFF.md for the work just completed. ${@}

Requirements:

- Keep it short enough to read at the start of the next session (roughly 40 lines).
- Include: date, branch/commit, task ID(s), what changed, exact verification commands and
  results, what was not verified and why, the next task, open questions/decisions, and any
  environment quirks.
- Tick the relevant PLAN.md checkboxes and add a decisions-log entry for non-obvious
  choices.
- Distinguish "passes" from "not run". Never claim success without command output.
- Keep the session log to the last 2–3 entries; older detail lives in git and PLAN.md.

Then show me the diff of docs/HANDOFF.md and PLAN.md. Do not commit unless I ask.
