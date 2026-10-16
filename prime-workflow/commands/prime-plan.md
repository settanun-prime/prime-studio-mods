---
description: Prime plan checkpoint - write .prime/plan.json (streams, ownership, deps, acceptance), validate, accept, create worktrees
argument-hint: [init|check|accept|apply|show] [title]
---

The plan is the checkpoint before any fan-out. Plugin script: `node ${CLAUDE_PLUGIN_ROOT}/scripts/prime-plan.mjs`.

1. No plan yet: `prime-plan.mjs init --title "<title>"`, then write the plan yourself (you are the hub; research first if needed) as JSON matching `${CLAUDE_PLUGIN_ROOT}/prime.plan.schema.json` to `.prime/plan.json` in the main checkout. Each `acceptance` entry is a runnable command that fails without the work.
2. `prime-plan.mjs check`: fix every error. Two streams may own the same path only if one `dependsOn` the other.
3. Show the plan (`prime-plan.mjs show`) to the user and wait for an explicit OK. Then `prime-plan.mjs accept` (records `--by user`). In autopilot `prime-reviewer` approves instead (`accept --by reviewer`), unless `automation.planApproval` is `user`.
4. `prime-plan.mjs apply` (dry-run), then `prime-plan.mjs apply --apply` to create the worktrees with ownership maps.
5. If the plan must change later: edit, `check`, show, `accept` again (apply refuses a changed plan until re-accepted).

Arguments given: $ARGUMENTS
