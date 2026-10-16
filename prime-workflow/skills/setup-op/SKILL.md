---
name: setup-op
description: Choose the reasoning budget and the model per role that /op-mode subagents and the Prime herdr team use. Writes ~/.claude/op/models.json through op-config.mjs, which validates every value. Use for /setup-op, "op budget", "op models", or changing which models op mode uses.
disable-model-invocation: true
---

# Setup op

`R` = `${CLAUDE_PLUGIN_ROOT}`. Every write goes through `R/scripts/op-config.mjs`: it validates, merges and derives effort, so never edit the file by hand.

1. **Current state.** `node R/scripts/op-config.mjs show`. Name the current budget if a file exists, or say `large` matches the shipped defaults.
2. **Budget.** Ask with AskUserQuestion, these four options with these exact labels:
   - `unlimited — max reasoning`
   - `large — xhigh reasoning` (the shipped defaults)
   - `medium — high reasoning`
   - `small — medium reasoning`
3. **Preview.** `node R/scripts/op-config.mjs show --budget <choice>` and show the table. Each role's effort is the budget's level plus the role's step (`hub` and `hardest` one above, `explorer` two below), capped at `max` (Codex at `xhigh`).
4. **Models.** Ask whether to accept the table or change roles. For Claude roles offer only the models this session's Agent tool accepts in its `model` field, plus `inherit` (the parent chat's model). For `codex` keep the current id unless the user names another. A role may also pin an effort, which then ignores later budget changes.
5. **Write.** `node R/scripts/op-config.mjs set --budget <choice> [role=model[:effort] ...]`. `role=default` drops a pin. Exit 2 means a value was refused: show the message and ask again.
6. **Team check.** Say which Prime roles can run here: `command -v herdr codex hermes` (herdr is required for the autopilot team, Codex and Hermes are optional builders).
7. **Confirm.** The table applies from the next `/op-mode` run and the next Prime teammate started. No restart. Re-run `/setup-op` to change it.
