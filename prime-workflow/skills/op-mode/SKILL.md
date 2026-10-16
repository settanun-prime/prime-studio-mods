---
name: op-mode
description: Rigor mode for any non-trivial task. Classifies the task, opens the matching playbook as the task list, loads only the skills that playbook needs, runs subagents on the /setup-op models, hands multi-part work to the Prime autopilot, and proves the result before reporting. Use for /op-mode, "op mode", or when the user asks for the work to be done rigorously.
disable-model-invocation: true
---

# op mode

`R` = `${CLAUDE_PLUGIN_ROOT}`. Playbooks: `R/skills/op-mode/playbooks/`. Principles: `R/skills/prime-principles/SKILL.md` (sections below are `§n`). Adapted from pstack's poteto-mode (MIT), rebuilt around the Prime harness.

## Start (every time, before any other step)

1. `node R/scripts/op-config.mjs show`: the role table (model and effort per role). With no file it prints the defaults; say once that `/setup-op` changes them.
2. Classify the task with the Router. Open a task list whose first items are the playbook's steps copied verbatim. A step you choose not to do stays in the list as `skip: <reason>`.
3. Say in one line: the playbook, the skills you will load, the roles you will spawn.

## Router

A skill named below is loaded only when it is in this session's skill list. Otherwise follow the bundled fallback in the same row. Never stall on a missing skill.

| Task | Playbook | Load (fallback) |
|---|---|---|
| Read-only question: how does X work, why is Y so, should we do A or B | §4E Investigation | Explore subagents on `explorer` (§4E) |
| A reported defect | §4B Bug Fix | `superpowers:systematic-debugging`, `superpowers:test-driven-development` (§4B) |
| New or changed behaviour, one focused part | §4A Feature | `superpowers:brainstorming` only when intent is unclear, `superpowers:test-driven-development` (§4A) |
| Behaviour-preserving restructure | §4C Refactor | `simplify` after the change (§1.3, §4C) |
| Measured slowness | §4D Performance | none (§4D) |
| A fork an experiment can settle: which is faster, which layout reads, does it even work | `playbooks/prototype.md` | none |
| Two or more parts, several files, or "do it automatically" | Prime autopilot | the `prime-workflow` skill: it runs the `prime-run.mjs` harness with its gates |
| A long run the user steps away from | `playbooks/autonomous-run.md` | decision trail (below) |
| Resume a prior agent's or session's work | `playbooks/pickup.md` | none |
| Stop cleanly: pause, compaction ahead, going offline | `playbooks/pause.md` | none |
| Nothing above fits | write a bespoke playbook first: 3 to 8 steps, each ending in a check you can run | §1 to §5 |

Every playbook ends with **Finish** below.

## Triggers (apply inside any playbook)

- **Any code.** Name the data shape first and pick its structure per §2 (Model the Domain).
- **A change that crosses a file or function boundary.** Map the blast radius per §3 before editing: direct touch, callers, shared state, containment.
- **About to ask the user "which approach".** If running something could answer it (behaviour, timing, output, layout), run `playbooks/prototype.md` and let the result decide. Ask only product or preference calls no experiment settles.
- **Two fixes on the same premise failed.** Write the premise down and test it directly before a third fix.
- **Contested design or a high-stakes diff.** Second opinion: the same prompt to a different model family (`R/scripts/prime-codex.sh review --base <base>`, or an Agent on `reviewer` when the author was not Claude). Agreement is high signal. Disagreement goes to §6.
- **A number you measured** (speedup, latency, eval score). Before reporting it, find what limits it and rule out that it measured something else.
- **Security-relevant diff** (auth, input parsing, shell, secrets, permissions). `security-review` if listed (§6).
- **The same instruction written twice.** Encode it as a test, lint or script instead of more prose.
- **A skill is broken mid-task.** Work around it in the open, say so in the reply, and propose the fix as its own task. Never silently.

## Subagents

- Every Agent call sets `model` and `effort` from the role table: `explorer` for searches, `builder` for focused code, `hardest` for cross-cutting design or subtle concurrency, `reviewer` for review and prose, `verifier` for independent checks. `inherit` means omit `model`.
- Raise effort one step for the subtlest work. Lower it for routine sweeps. Keep the role's model family, so a second opinion stays a different family.
- Background by default. Pass file paths and the brief, not pasted file contents.
- Fresh agent for new work, with a consolidated brief: the original ask, every later directive, and the prior agent's report. Resume an agent only when its state is costly to move (uncommitted work, a running server).
- The verifier is never the agent that wrote the change.
- You own every subagent's output. Read its diff yourself and write your own summary.
- Herdr teammates of the Prime autopilot read the same table: `builder` for `claude-code`, `reviewer` for `prime-reviewer`, `codex` for the Codex CLI, `hub` for `prime-orchestrator`.

## Autonomy

- Proceed on reversible work without asking: edits in the working tree, local branches, running tests, reading anything.
- Always pause for: push or force-push, deploys, deleting data or unmerged branches, installing or uninstalling software, messages to people outside this session. These match the Prime **Never** list.
- "Keep going", "run until done", "I'm away" lift the pauses for reversible work only.
- No is a valid answer. Asked to add scope or shown an approach, give your real judgment, including "this does not earn its place".

## Decision trail

For long, autonomous or multi-part work, record each non-obvious decision as you make it:
`R/scripts/prime-ledger.sh decision "<what was chosen>" --why "<evidence>"`
`node R/scripts/prime-report.mjs` lists them. Outside a git repo, keep them in the reply instead.

## Finish (end of every playbook)

1. **Prove it works** (§5). Use `superpowers:verification-before-completion` if listed. Run the real artifact, and report the command, its exit code and the decisive output line. For UI or CLI changes, drive it (`run` if listed).
2. **Clean** (§7). Delete comments that restate code, dead code your change created, debug output. `simplify` if listed.
3. **Independent check.** A `verifier` subagent re-runs the acceptance commands from a clean read of the diff when the change is more than a few lines.
4. **Commit** only when the user asked or the playbook's owner (the Prime harness) does it. Never push.
5. **Reply**: answer first. Each claim carries its label: measured (with the command), inferred, or guess. Name each principle that changed a decision. Never hand the user a check you could run. Link only what you read or made this session.

Respect any active output style (for example caveman or ponytail): op mode adds rigor, not length.
