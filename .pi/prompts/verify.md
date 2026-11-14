---
description: Run the full TahoeLink verification suite and report exact evidence
argument-hint: "[focus]"
---
Read `.pi/skills/tahoe-verify/SKILL.md`, then follow it against the current working tree.
${@}

This is a verification pass: do not fix code unless I ask.

Report:

1. Environment probe (bun, docker, redis-server, mkcert).
2. Each command run, its exit code, and a one-line result.
3. Failures with file:line and the shortest relevant output.
4. Whether each failure is pre-existing (see docs/HANDOFF.md) or introduced by this change.
5. Flows exercised manually (lobby create/join, move, reconnect) and what you observed.
6. A clear verdict: PASS, PASS WITH KNOWN FAILURES, or FAIL.

If the output is large, delegate to the verifier subagent and ask for only failures and
exit codes. Do not update PLAN.md or docs/HANDOFF.md in this pass.
