# Changelog - prime-workflow

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); [SemVer](https://semver.org/). The repository-wide CHANGELOG.md summarises each release in Thai and English and links here.

## 1.1.1 - 2026-10-16

- **Fixed** on Windows the Node scripts ran `.sh` files directly, which Windows cannot execute (`spawnSync ... EFTYPE`): `prime-plan.mjs apply` created no worktree, and `prime-run.mjs` saw every gate, merge and cleanup step exit 1. A `.sh` now runs through `bash` there (`shArgv` in `scripts/lib/prime-node.mjs`).
- **Tests** `tests/v06.mjs` runs `.sh` files the same way, imports by `file://` URL, and skips the git-stub case Node cannot spawn on Windows; `tests/run.sh` keeps git on the PATH of the "CLI missing" cases and skips the exec-bit gate case on Windows, where files have no exec bit.

## 1.1.0 - 2026-10-16

- **Added** `/setup-op` (`skills/setup-op`) and `/op-mode` (`skills/op-mode` with the `prototype`, `autonomous-run`, `pickup` and `pause` playbooks), adapted from Cursor's `pstack` `/setup-pstack` and `/poteto-mode` (MIT). `/op-mode` routes a task to a playbook and the skills it needs, with a bundled fallback for each, and hands multi-part work to the autopilot.
- **Added** `scripts/op-config.mjs`: a reasoning budget plus a model and effort per role in `~/.claude/op/models.json` (`OP_CONFIG` overrides the path). Effort is derived on every read, so a new budget moves every role without a pinned effort.
- **Added** `prime-team.sh` passes `--model`/`--effort` from `/setup-op` to `claude-code` (`builder`) and `prime-reviewer` (`reviewer`) teammates and uses its Codex choice before the plugin config. `prime-bg.sh` does the same for the hub (`hub`). Without a `/setup-op` file nothing changes.
- **Added** `prime-ledger.sh decision "<choice>" --why "<evidence>"`; `prime-report.mjs` lists the decisions.
- **Fixed** `scripts/lib/prime-common.sh` ended with "aliases" that redefined `prime_log`, `prime_warn`, `prime_die` and 17 other helpers to call themselves, so a script died on its first log line. The block is gone.
- **Tests** `tests/op.test.mjs` (budgets, pins, validation, and a lint that every file, section, script and role op-mode names exists) and new cases in `tests/run.sh`.

## 1.0.0 - 2026-10-16

- **Added** `skills/prime-principles/SKILL.md`: engineering rigor adapted from Cursor's `pstack` (poteto-mode), enforcing the Laziness Protocol (YAGNI, minimal diffs, standard library first), Domain Modeling, Boundary Discipline, Pre-Coding Blast Radius Mapping, 5 Stream Playbooks, Scientific Verification ("Prove It Works"), Adversarial Interrogation, and Anti-Slop / No-Comment hygiene across all roles.
- **Added** optional `blastRadius` (affected modules, callers, shared resources, migrations) and stream `playbook` (`feature`, `bug-fix`, `refactor`, `perf`, `investigation`) to `prime.plan.schema.json` and `scripts/prime-plan.mjs` init template.
- **Upgraded** `skills/prime-workflow/SKILL.md` and `agents/prime-orchestrator.md`: planning phase requires pre-coding blast radius mapping, stream playbook assignment, and disjoint path containment before dispatching parallel worktrees.
- **Upgraded** `agents/prime-reviewer.md`: equipped with adversarial interrogation (multi-angle review, runtime test proof validation, edge-case analysis, comment noise / slop rejection) combined with the Codex second opinion (`prime-codex.sh review`).
- **Upgraded** builder roles (`claude-code.md`, `codex.md`, `hermes.md`): enforced playbook execution (reproduce bug with test first, feature contract first), laziness protocol, self-documenting code without syntax comments, and "Prove It Works" runtime evidence reporting.
- **Upgraded** `skills/prime-architecture/SKILL.md` and `docs/prime-architecture.md` with the new principles and playbooks architecture.

## 0.8.0 - 2026-10-11

- **Changed (breaking)** the plugin is **`prime-workflow`**. Agents are now `prime-workflow:<role>` (e.g. `claude --agent prime-workflow:prime-orchestrator`), skills are `prime-workflow:prime-workflow` and friends, commands are `/prime-workflow:prime-*`, and the plugin's MCP servers are `plugin:prime-workflow:*`; install with `claude plugin install prime-workflow@prime-studio-mods`. Script names, `.prime/`, `prime.config.json` and the Hermes profile `prime` are unchanged. Disable the old plugin so its skills do not trigger twice; projects whose scripts call the old plugin path need the new one.
- **Fixed** `prime-team.sh` no longer marks a Claude Code teammate `failed` when it ends its turn while a backgrounded command (such as `prime-codex.sh review`) still runs. Claude resumes when that command exits, so the script now waits for the report while the teammate is working or runs a command under its tab, and gives up after 30 s with neither. A running command stops counting after `codex.timeoutSec` + 10 min, so a background server left by an earlier ask cannot hold the wait open. A report written just before the teammate exits still counts.
- **Fixed** a prompt that herdr reports as `agent_prompt_stalled` is the text sitting unsubmitted in the CLI's input box: `prime-team.sh` presses Enter once and keeps waiting for the report instead of failing, and `prime-bg.sh` does the same when the hub does not start working. Enter is only sent while the CLI is still idle, so it never answers a question or approval on screen, and an Enter that fails is reported, not recorded as sent.
- **Fixed** `prime-bg.sh` gives the hub a one-line pointer to the goal file instead of pasting the whole goal: a long multi-line paste was left unsubmitted.

## 0.7.0 - 2026-10-11

- **Changed (breaking)** Prime runs its agent team on **herdr only**. Every role is a live teammate in its own tab of the hub's herdr workspace, started and driven by the new `scripts/prime-team.sh` (`ask <name> <role> <dir> <brief>`, `wait <name>`, `stop <name>|--all`); the hub no longer dispatches Claude Code subagents. Builders keep their tab between `build` and `fix` (same context); reviewers are fresh per verdict. Exit 4 means a teammate waits on the user in herdr. The script records each run in the ledger.
- **Added** the `hermes` role: Hermes Agent in its own profile (`team.hermesProfile`, default `prime`), so Prime's Hermes memory stays separate from your other Hermes work. It runs one turn per ask (`hermes chat --oneshot -c <name> --create-if-missing`) in a herdr tab; plans may give self-contained streams to `hermes`.
- **Changed** the `codex` role is now the real Codex CLI as a teammate (`--approve-for-me`, model and effort from `codex`), no longer Claude Haiku driving `prime-codex.sh`; `prime-codex.sh review` stays the reviewer's second opinion.
- **Added** `scripts/prime-bg.sh` (from the unreleased herdr background work): starts the hub in a herdr workspace that outlives the terminal and keeps the Mac awake while it works. Herdr missing is now exit 3 = stop; without extra args the hub gets `team.claudeArgs`.
- **Added** `team` in `prime.config.json` (`claudeArgs` default `--permission-mode auto`, `codexArgs`, `hermesProfile`, `hermesArgs`), `budgets.perRole.hermes`, `hermes` in the plan role enum and Context7 routing, doctor checks for herdr and the Hermes profile.
- **Known limitations** a teammate started in a folder its CLI does not trust stops at the trust dialog (exit 4); worktrees of a trusted main checkout start straight away. herdr cannot always tell when Hermes is busy, which is why Hermes runs one turn per ask.

## 0.6.0 - 2026-10-11

- **Added** a per-run integration branch `prime/<slug(title)>-<hash6>`, named by `prime-plan.mjs accept` (kept on a re-accept; a new name once its final merge happened) and created by the harness from the target. Streams branch from it and merge into it; the target (`main`) is untouched until the final review approves. The schema gains optional `integration`; a plan accepted under 0.5 must be accepted again. `prime-plan.mjs apply` defaults its base to the integration branch.
- **Added** the `final-review` action: after the last stream the harness cleans up, opens a final worktree on the integration branch, runs `verify` (acceptance checks, gate, paths check), and `prime-reviewer` reviews the whole `target...integration` diff with a Codex second opinion, recording `prime-review-record.sh VERDICT --base <target>`. APPROVE: one `prime-merge.sh --apply --base <target> --no-rebase`. A moved target goes to `resolve` (`git merge <target>` into the integration branch, never rebase). REQUEST_CHANGES: `replan` adds a fix stream under a new slug and keeps the merged streams in the plan (the final paths check uses all of them). Stream actions carry `base` = integration; `final-review` carries `base` = target. See ADR-0004.
- **Added** `prime-merge.sh --no-rebase` (exit 4 when the base moved) and a base lock: a plan stream refuses any base but the integration branch (exit 3, `base-not-integration`, not skipped by `--ignore-order`).
- **Added** `prime-plan.mjs scan [--base R]`, a secret scan of the added lines of the net diff and of every commit (merge-conflict resolutions included, binary-looking files included) plus `.env*` files other than `.env.example`, `.env.sample`, `.env.template`. It prints `file:line pattern-name`, never the value; a line with `prime-allow-secret` is skipped. Exit 0 clean, 3 hits, 2 usage or cannot scan. Octopus merges fail closed (`octopus-merge:0 unscanned`) and a patch over 64MB fails with exit 2 (`branch patch exceeds 64MB`). It runs in each stream's check (`secret-scan`) and in `prime-merge.sh` before the gate, where any non-zero exit refuses the merge (exit 3).
- **Added** path ownership: files outside a stream's `paths` come back as `fix` (`paths`), and `verify` applies the union of all streams' paths to the integration diff.
- **Added** plan checks (`check`, `accept`, `apply`, harness `create`): an owned path that is gitignored with no tracked files, or that has untracked files in the main checkout, is an error.
- **Changed** the acceptance checks re-run when a stream's acceptance commands or `paths` change, or when the integration head moves. `verify` and cleanup use the integration branch.
- **Changed** `docs/exit-codes.md` (scan 0/2/3, `--no-rebase` exit 4, secret-scan refusal), the `codex` role (merge, never rebase, in the final worktree), `prime-reviewer` (final review section), the orchestrator, the `prime-workflow` skill, `/prime-merge`, the workflow diagram, the architecture, and the READMEs and quickstarts.
- **Known limitations** the plan check reads the main checkout's working tree, not the plan `base` branch: keep the main checkout's `.gitignore` in line with the base and use trailing slashes for directory paths. `maxParallelWorktrees` also counts merged streams, so a plan at the limit cannot add a fix stream after a final REQUEST_CHANGES: keep plans one stream under the limit. `integration === target` is not rejected yet.
- **Out of scope** mechanical enforcement of reviewer independence; a maximum diff size beyond the 64MB scan buffer; scanning octopus merges.

## 0.5.0 - 2026-10-09

- **Removed (breaking)** the `grok-build` agent. Prime, the hub, now plans and researches itself; `budgets.perRole.grok-build` is gone and Perplexity is routed to the hub only.
- **Added** autopilot: the `prime-workflow` skill starts on its own for a coding goal in a git repo that spans several files or parts, and runs the whole loop with no slash commands. It ticks the harness, dispatches the agents it asks for (in parallel), records each run in the ledger and stops at `done` or `stop`.
- **Added** `scripts/prime-run.mjs`, the harness. One tick reads the plan, worktrees, state files and ledger, and with `--apply` does every mechanical step itself: create worktrees in dependency order, run each stream's acceptance checks on its HEAD, run the gate (writing `.prime/gate.sh` from the acceptance commands when the project has no checks), merge approved branches into the local base one at a time in plan order, clean up, and `verify` every acceptance check plus the gate on the merged base. What is left comes back as agent actions (plan, fix-plan, approve-plan, build, fix, review, resolve, ask-merge, replan) or wait / stop / done. It stops a stream after `hardStopOnRepeatedFailures` failed checks or reviews, or when a step makes no progress, and it never pushes.
- **Added** `scripts/prime-codex.sh`: runs the real Codex CLI in the current worktree. `run "<brief>"` edits files (`workspace-write`, the caller commits); `review [--base]` is a read-only second opinion that ends with a `VERDICT` line. Exit 3 when the CLI is missing, so the stream goes to `claude-code`. Runs are recorded in the ledger.
- **Added** `automation` (`planApproval: reviewer|user`, `merge: local|ask`) and `codex` (`model` `gpt-6.1-sol`, `reasoningEffort` `xhigh`, `timeoutSec`) in `prime.config.json`; `PRIME_CODEX_MODEL` / `PRIME_CODEX_EFFORT` override them.
- **Changed** model tiers: hub skill and `prime-orchestrator` on Claude Opus 5.5 at effort max (maxTurns 150); `prime-reviewer` on Claude Opus 5.5 at effort high, now also reviewing plans and asking Codex for a second opinion; `claude-code` on Claude Sonnet 5.5 at effort high, committing its own work; `codex` on Claude Haiku 5.5 as the driver of the Codex CLI.
- **Changed** by default the reviewer approves the plan (`prime-plan.mjs accept --by reviewer`, recorded in the ledger) and approved branches merge into the local base without asking. `automation.planApproval: "user"` and `automation.merge: "ask"` bring the human checkpoints back.
- **Added** `prime-plan.mjs apply --only SLUG` and `--base REF`.
- **Changed** `/prime-doctor` checks the new scripts and warns when the Codex CLI is not installed.
- **Fixed** a worktree in the middle of a rebase (detached HEAD) was not matched to its branch.
- **Changed (breaking)** the review fingerprint is now `git patch-id --verbatim` (git 2.39+, the doctor fails below it), so a whitespace-only change needs a new review. Branches approved by 0.4 are reviewed once more.
- **Fixed** after a cross-model review (Codex): base names with shell characters are refused (exit 2); an option given without a value (`--base`, `--note`, ...) no longer loops forever (exit 2); an approved stream waits for the streams it depends on; changed acceptance checks re-run on the same commit and refresh the generated gate, which now runs each check in its own shell; `verify` re-runs after the plan changes, includes the project's `.prime/gate.sh` and counts every gate error; a merge counts only with its recorded head in the base and the same plan stream (`prime-plan.mjs stream-id`, logged by `prime-merge.sh`), so a later plan that reuses a slug is not taken as merged; `verify` re-runs when `.prime/gate.sh` or `PRIME_GATE_CMD` changes; a `.prime/gate.sh` that is not executable fails the gate instead of being skipped; automatic cleanup touches only the plan's worktrees (`prime-cleanup.sh --branch`); the `ask-merge` command is shell-quoted; `prime-codex.sh` outside a git repo exits 2; the `codex` role reverts only stray files it changed itself; a merge in progress is resolved with `git merge --continue`.
- **Changed (breaking)** the workflow is now named Prime everywhere: commands `/prime-*`, agents `prime-orchestrator` and `prime-reviewer`, skills `prime-workflow` and `prime-architecture`, scripts `scripts/prime-*`, `prime.config.json`, `prime.plan.schema.json`, environment variables `PRIME_*`, the gate template `templates/github/prime-gate.yml`, and state in `.prime/` and `<common-git-dir>/prime/`.
- **Added** `docs/workflow-diagram.md`: the whole workflow (plan, build, queue, review, merge, cleanup) as one diagram.
- **Added** Codex support: `.codex-plugin/plugin.json` and a Codex marketplace (`.agents/plugins/marketplace.json` at the repository root), so `codex plugin marketplace add settanun-prime/prime-studio-mods` then `codex plugin add prime-workflow@prime-studio-mods` installs the skills and both MCP servers. The `prime-workflow` skill explains how to run each step in Codex: `${CLAUDE_PLUGIN_ROOT}` path, `commands/prime-<step>.md` in place of slash commands, an independent reviewer and `codex mcp login perplexity`.
- **Added** SDLC phases (requirements, design, build, test and review, release, maintain), each with an exit criterion, and the principles behind them, in the `prime-workflow` skill, the orchestrator's loop and `docs/workflow-diagram.md` (English and Thai).

## 0.4.0 - 2026-10-08

- **Added** `/prime-plan` + `scripts/prime-plan.mjs` + `prime.plan.schema.json`: the plan checkpoint is a file (`.prime/plan.json`, git-excluded). `check` validates schema, stream budget, acceptance checks, relative paths, dependencies (no cycles) and file ownership (two streams may share a path only if one depends on the other). `accept` records a hash; `apply --apply` refuses an unaccepted or changed plan and creates worktrees in dependency order with ownership maps. See ADR-0003.
- **Added** `/prime-queue` + `scripts/prime-queue.mjs`: merge order by plan dependencies, readiness, conflicts predicted with `git merge-tree` (against base and between branches), overlaps and size. Read-only.
- **Added** run ledger `<common-git-dir>/prime/runs.jsonl` (gate, review, merge, worktree, plan, cleanup events), `scripts/prime-ledger.sh agent <role> --turns N`, and `/prime-report` + `scripts/prime-report.mjs` (turns per agent vs `maxTurns`, `--strict`, `--json`). `PRIME_LEDGER=0` disables it.
- **Added** `tests/smoke.sh`: dry-run end-to-end test in a temp repo (plan -> worktrees -> gate -> review -> queue -> ordered merge -> report -> cleanup), no network.
- **Added** `docs/QUICKSTART.md` (Thai) and `docs/QUICKSTART.en.md`; `docs/exit-codes.md`; ADR-0003.
- **Changed** `prime-merge.sh --apply` refuses (exit 3) a branch whose plan dependencies are not merged; `--ignore-order` overrides.
- **Changed** `prime-gate.sh` limits each step to `reviewGate.stepTimeoutSec` (1800 s; `PRIME_GATE_TIMEOUT`); a timed-out step fails the gate.
- **Changed** `/prime-doctor` prints a `fix:` hint for every WARN/FAIL, fails if `.mcp.json` sends an Authorization header (401 regression guard), bounds `claude mcp list` with a timeout, warns on git older than 2.38, and shows plan and ledger state.
- **Changed** `prime-config-check.mjs` uses a shared schema validator and fails on a `tools:` allowlist in any agent.
- **Fixed** `worktree-new.sh` created feature branches tracking `origin/<base>`, so `prime-cleanup.sh --delete-branches` could not delete them after a local merge. Branches are now created with `--no-track`.
- **Changed** all scripts are shellcheck-clean; `GIT_TERMINAL_PROMPT=0` so git never waits for credentials.

## 0.3.0 - 2026-10-08

- **Fixed** Perplexity MCP returned HTTP 401: the plugin sent `Authorization: Bearer ${PERPLEXITY_API_KEY}` with the variable unset, and a set Authorization header disables OAuth. The plugin now uses Perplexity sign-in (`/mcp`); the API-key route is documented as opt-in.
- **Fixed** role agents could not reach any MCP tool (`tools:` allowlist). They now use `disallowedTools`; read-only roles deny Write/Edit/NotebookEdit.
- **Fixed** `codex` used an invalid colour (`magenta` -> `purple`).
- **Fixed** `prime-merge.sh` ran the gate before rebasing and checked out the base inside the feature worktree. Now rebase -> gate -> review fingerprint -> merge in the base worktree; never pushes the base.
- **Added** `maxTurns` per agent (budget enforcement), checked against `prime.config.json`.
- **Added** graceful fallback: Perplexity/Context7 optional; agents use WebSearch/WebFetch.
- **Added** `/prime-doctor`, `/prime-status`, `/prime-cleanup`; `prime-review-record.sh` (verdict bound to `git patch-id`); `prime-merge.sh --pr` (draft PR via `gh`).
- **Added** `prime.config.schema.json` + `scripts/prime-config-check.mjs`; `templates/github/prime-gate.yml`; `tests/run.sh`.
- **Changed** gate/review state moved from the work tree to `<git-dir>/prime/`; `worktree-new.sh` validates slugs, enforces `maxParallelWorktrees`, and excludes `.env.worktree` and `.prime/` from git.

## 0.2.0 - 2026-10-08

- **Added** `prime-reviewer` agent, `/prime-review`, `/prime-merge`, `prime-gate.sh`, `prime-merge.sh`, `prime.config.json`, ADRs, worktree isolation.

## 0.1.0 - 2026-10-08

- **Added** first version: Prime hub + Grok Build / Claude Code / Codex roles, git worktree skill, Context7 + Perplexity MCP.
