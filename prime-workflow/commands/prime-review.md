---
description: Prime review gate - run lint/typecheck/test and the prime-reviewer agent, record the verdict
---

In the feature worktree being reviewed:

1. Ensure everything is committed.
2. Delegate to the `prime-reviewer` agent with: branch, base, the plan's acceptance checks, and ownership paths.
3. The reviewer reuses the harness results when they match HEAD, otherwise runs the acceptance checks and `${CLAUDE_PLUGIN_ROOT}/scripts/prime-gate.sh`, and records its verdict with `${CLAUDE_PLUGIN_ROOT}/scripts/prime-review-record.sh`.
4. Report `VERDICT` and findings. Only APPROVE lets `/prime-merge --apply` proceed; any later commit or conflict edit invalidates the approval.
