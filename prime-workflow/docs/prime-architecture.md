# Prime architecture - Prime Workflow (v1.0.0)

Prime coordinates several AI agent roles in one workflow: a hub plans and dispatches, a harness does the mechanical steps and checks, each feature gets its own git worktree, and nothing reaches the base branch without passing a gate and an independent review. It started from the "Getting started with Prime" infographic (multi-agent roles, Perplexity MCP and Context7 MCP), extended with review, merge and isolation rules, and since v0.5 runs on autopilot.

> "Claude Code", "Codex" and "Hermes" here are **roles**, each run as a live teammate in its own herdr tab (since v0.7; no Claude Code subagents). `prime-reviewer` and `claude-code` are Claude Code sessions with the plugin's agent file; `codex` is the real Codex CLI with your own Codex login; `hermes` is Hermes Agent in its own profile. Nothing else logs in to an external product.

## Flow

```mermaid
flowchart TB
  goal([Goal in plain words]) --> O["Prime hub<br/>prime-workflow skill or prime-orchestrator"]
  O -- writes --> PL[/".prime/plan.json<br/>streams, ownership, deps, acceptance"/]
  PL --> H{{"prime-run.mjs tick"}}
  H -- approve-plan --> RP["prime-reviewer: plan review<br/>or you if planApproval is user"]
  RP -- REQUEST_CHANGES --> O
  RP -- accept --> H
  H -- create in dependency order --> WT[/"worktree per stream<br/>port, .env.worktree, ownership.json"/]
  WT --> CC["claude-code: build / fix"]
  WT --> CX["codex: Codex CLI build / fix"]
  CC -- commit --> H
  CX -- commit --> H
  H -- acceptance checks + prime-gate.sh pass --> RV["prime-reviewer<br/>+ Codex second opinion"]
  RV -- REQUEST_CHANGES --> H
  RV -- APPROVE recorded --> H
  H -- merge, plan order --> BASE[("local base branch<br/>not pushed")]
  H -- conflict exit 4: resolve --> CX
  BASE --> V[/"cleanup + verify on the merged base"/]
  V -- fail: replan --> O
  V -- pass --> D(["done: final report"])

  LED[("ledger<br/>common-git-dir/prime/runs.jsonl")]
  H -.-> LED
  RV -.-> LED
  O -.agent runs, prime-team.sh.-> LED
  LED -.-> D

  PPLX[("Perplexity MCP<br/>optional")] -.research.-> O
  WS[("WebSearch / WebFetch")] -.fallback.-> O
  C7[("Context7 MCP<br/>optional")] -.docs.-> CC
  C7 -.-> CX
  C7 -.-> RV
```

## Prime principles and playbooks (v0.8)

Adapted from high-rigor engineering playbooks (pstack/poteto-mode), Prime enforces systematic engineering rigor across every agent:

- **Laziness Protocol (YAGNI & Minimalism)**: Write the minimum code required to solve the immediate problem. Standard library before custom code; native platform features before dependencies; one line before fifty. Zero speculative abstractions or premature helper factories. Subtract before adding.
- **Domain Modeling & Boundary Discipline**: Rich domain types, making invalid states unrepresentable. Strict isolation of side effects. Every stream strictly owns its declared `paths` in `.prime/plan.json`.
- **Pre-Coding Blast Radius Mapping**: Before touching code, the hub maps direct touches, upstream callers, downstream dependents, shared resources (DB schemas, ports, env keys), and failure containment. Parallel streams with shared files or contracts MUST define `dependsOn`.
- **The 5 Stream Playbooks**:
  1. `feature`: Domain Model -> Contract/Types -> Acceptance Test First -> Minimal Implementation -> Runtime Verification.
  2. `bug-fix`: Reproduce with a failing test/script first -> Root-cause isolation -> Surgical fix -> Regression proof.
  3. `refactor`: Establish test safety net -> Strictly preserve external behavior -> Subtract dead code & simplify -> Incremental verification.
  4. `perf`: Baseline measurement -> Single hypothesis -> Profile/benchmark -> Targeted optimization -> Delta proof.
  5. `investigation`: Read-only exploration -> Evidence gathering -> Blast radius assessment -> Actionable stream plan.
- **Scientific Verification ("Prove It Works")**: Runtime evidence over assertions. Acceptance commands must execute real checks against actual behavior and exit 0. No claim is accepted without execution logs.
- **Adversarial Interrogation**: Reviewers never rubber-stamp; they challenge assumptions, test edge cases/failure states, audit blast radius boundaries, eliminate comment noise, and cross-examine with a Codex second opinion (`prime-codex.sh review`).
- **Signal-to-Noise (Anti-Slop & No-Comments)**: Clean, dense communication. Code must be self-documenting. Redundant comments restating syntax are banned; comments are preserved strictly for non-obvious "why", domain constraints, and upstream workarounds.

## Roles

| Agent | Model | Job | Tools | maxTurns |
|---|---|---|---|---|
| hub: `prime-workflow` skill (main thread) or `prime-orchestrator` | Claude Opus 5.5, effort max, in a herdr pane | requirements, research, plan, harness ticks, dispatch | all | 150 (`prime-orchestrator`) |
| `prime-reviewer` | Claude Code teammate, Opus 5.5, effort high | approves or rejects the plan; reviews each branch with the gate results and a Codex second opinion; records the verdict | all except Write/Edit/NotebookEdit | 25 |
| `claude-code` | Claude Code teammate, Sonnet 5.5, effort high | implement, refactor or fix in one worktree, then commit | all | 40 |
| `codex` | Codex CLI teammate (`gpt-6.1-sol`, reasoning `xhigh`, `--approve-for-me`) | multi-file integration and conflict resolution; edits, checks and commits | Codex CLI | 40 (budget) |
| `hermes` | Hermes Agent teammate, profile `prime` (Prime's own clean memory), one turn per ask | self-contained streams; edits, checks and commits | Hermes, no messaging/cron/delegation | 40 (`--max-turns`) |

`maxTurns` in each agent's frontmatter is enforced by Claude Code; `prime.config.json` holds the same numbers and `prime-config-check.mjs` fails if they drift. The Codex model and effort come from `prime.config.json` → `codex`, or `PRIME_CODEX_MODEL` / `PRIME_CODEX_EFFORT`. When the Codex or Hermes CLI or the Hermes profile is missing (`prime-team.sh` exit 3), the stream goes to `claude-code`; `/prime-doctor` warns about it. `prime-codex.sh review` stays the reviewer's Codex second opinion.

## Agent team on herdr (v0.7)

- Prime runs its team on herdr only. The hub runs in a herdr pane; outside herdr it hands the run off with `scripts/prime-bg.sh`, which starts `prime-orchestrator` in its own herdr workspace (it outlives the terminal and keeps the Mac awake). Herdr missing is exit 3: stop.
- `scripts/prime-team.sh ask <name> <role> <dir> <brief>` starts the teammate in a new tab of the hub's workspace if needed, hands it the brief, waits and prints its report; `wait <name>` resumes, `stop <name>|--all` closes tabs. It records each run in the ledger.
- Builders keep their tab between `build` and `fix` (same context); reviewers are fresh per verdict. Exit 4 = the teammate waits on the user in herdr (approval, folder trust, sign-in): answer it in its tab, then `prime-team.sh wait <name>`.

## Integration branch and final review (v0.6)

- `prime-plan.mjs accept` names the run's branch `prime/<slug(title)>-<hash6>` (hash of the accepted plan; slug lowercase, max 40 chars). A re-accept after a replan keeps the name; if that branch already has its final merge, the name is computed again from the plan hash, so an unchanged plan gets the same name and the run reports nothing to merge (change the plan to start a new run). `integration` is not part of the plan hash. The harness creates the branch from the **target** (the plan `base`, e.g. `main`) with `git branch --no-track`.
- Streams branch from the integration branch, are checked, gated and reviewed against it, and merge into it with `prime-merge.sh --apply --base <integration>`. A plan stream can never merge into another base (`base-not-integration`, exit 3). The target is untouched.
- After the last stream: stream worktrees are cleaned up; a final worktree `<repo>-prime-<name>` is created on the integration branch (reused if one exists) with a gate; if the target moved or the tree is dirty, `codex` merges the target into the integration branch (`git merge`, never rebase: it has merge commits); `verify` runs every acceptance check, the gate and the paths check; then `final-review`: `prime-reviewer` reviews the whole `target...integration` diff, with `prime-codex.sh review --base <target>`, and records `prime-review-record.sh VERDICT --base <target>` in the final worktree.
- APPROVE: one `prime-merge.sh --apply --base <target> --no-rebase` in the final worktree (`ask-merge` when `automation.merge` is `ask`). Exit 4 (target moved) goes back to `resolve`; exit 5 (stale) to a new `final-review`. REQUEST_CHANGES: `replan`, which adds a **fix stream under a new slug** and keeps the merged streams in the plan; the final paths check uses all of them. After `hardStopOnRepeatedFailures` REQUEST_CHANGES on the branch, or a BLOCK, the run stops. Then the final worktree is removed (branches are never deleted) and the run is `done`. Nothing is pushed.

## Guardrails (v0.6)

- **Secret scan** `prime-plan.mjs scan [--base R]`: added lines of the net diff `merge-base..HEAD` plus every commit in the range (so a secret committed and then deleted is still caught; merge-conflict resolutions are included through `--diff-merges=remerge`), binary-looking files included (`--text`), plus added `.env` / `.env.*` files other than `.env.example`, `.env.sample`, `.env.template`. Patterns: AWS, private keys, GitHub, Slack, Stripe live, Anthropic and OpenAI-style keys, Google API keys, and quoted `key/secret/token/password` assignments of 16+ characters. A hit prints `file:line pattern-name` (and `@sha7` for history), never the value; a line containing `prime-allow-secret` is skipped. Exit 0 clean, 3 hits, 2 usage or cannot scan. Octopus merges fail closed (`octopus-merge:0 unscanned`) and a patch over 64MB fails with exit 2 (`branch patch exceeds 64MB`). It runs in the stream check (`secret-scan`, then `fix`) and in `prime-merge.sh` before the gate (any non-zero exit refuses with exit 3), also in the dry-run.
- **Path ownership** (`git diff --name-only --no-renames`, so a rename across the boundary lists both sides): files outside the stream's `paths` fail its acceptance run as `paths` and come back as `fix`; `verify` applies the union of all streams' paths to the whole integration diff.
- **Plan check** (`check`, `accept`, `apply` and the harness `create`, run against the main checkout, not every tick): an owned path that is gitignored with no tracked file under it is an error (worktrees will not carry it); one with tracked files is a warning; untracked, not-ignored files under an owned path in the main checkout are an error (worktrees start from git).
- **`--no-rebase`** on `prime-merge.sh`: if the base moved, exit 4 instead of rebasing. Used for the final merge so reviewed commits are never rewritten.
- **Re-runs:** the acceptance checks re-run when the stream's acceptance commands or `paths` change, or when the integration head moves.
- **Known limitations:** the plan check reads the **main checkout's** working tree, not the plan `base` branch; keep the main checkout's `.gitignore` in line with the base and use trailing slashes for directory paths. `maxParallelWorktrees` counts merged streams too, so a plan at the limit cannot add a fix stream after a final REQUEST_CHANGES: keep plans one stream under the limit. `integration === target` is not rejected yet. Reviewer independence is not enforced mechanically; the diff size is limited only by the 64MB scan buffer; octopus merges are not scanned.

## Harness and autopilot (v0.5)

- **Autopilot.** The `prime-workflow` skill starts on its own when you ask for a coding goal in a git repo that spans several files or parts; no slash command is needed. For a fully automatic session, start Claude Code with `claude --agent prime-workflow:prime-orchestrator`. The hub loops: `node scripts/prime-run.mjs --apply --json` → dispatch the returned actions to herdr teammates with `prime-team.sh` (all agent actions of one tick in parallel; the script records each run in the ledger) → tick again, until `done` or `stop`.
- **Harness** `scripts/prime-run.mjs` reads the plan, the worktrees, the state files in each worktree's `<git-dir>/prime/` (`accept.json`, `gate.json`, `review.json`) and the ledger. With `--apply` it does every mechanical step itself: create worktrees in dependency order, run each stream's acceptance checks on its HEAD, run the gate (when the project has no lint/typecheck/test it writes `.prime/gate.sh` from the acceptance commands), merge approved branches into the run's integration branch one at a time in plan order, clean up, `verify` (every acceptance check, the gate and the paths check), and after the final review make the one merge into the local base (see "Integration branch and final review"). Without `--apply` it only shows the next actions; `prime-run.mjs verify` checks the base now.
- **Agent actions** it returns: `plan`, `fix-plan`, `approve-plan`, `build`, `fix`, `review`, `final-review`, `resolve`, `ask-merge`, `replan`; plus `wait`, `stop` and `done`. Stream actions carry `base` = the integration branch; `final-review`, the final `resolve` and the final `ask-merge` carry `base` = the target. Mechanical steps it does itself: `integrate`, `create`, `check`, `gate`, `merge`, `cleanup`, `final-worktree`, `verify`, `final-merge`, `final-cleanup`.
- **Checkpoints.** By default `prime-reviewer` approves the hub's plan (`prime-plan.mjs accept --by reviewer`) and approved branches merge into the local base without asking. In `prime.config.json` → `automation`, `planApproval: "user"` waits for your OK on the plan and `merge: "ask"` asks before each merge. The harness never pushes; pushing, PRs and deploying stay your call.
- **Stops.** A stream stops after `hardStopOnRepeatedFailures` (3) failed checks or reviews since its last approval, after a BLOCK, or when a step makes no progress. Prime reports the stream and why, and keeps driving the others. `done` means the one final merge into the target happened (after `verify` and the final review), or there was nothing to merge.

## Gate and merge

- `prime-gate.sh`: `PRIME_GATE_CMD` or `.prime/gate.sh` if present (a non-executable one fails the gate), else auto-detect flutter / pnpm / yarn / bun / npm (lint, typecheck, test), cargo, go, pytest. Exit 0 pass, 1 fail, 2 nothing to run. The result is stored for the current commit in the worktree's git dir (`<git-dir>/prime/gate.json`), never in the work tree.
- `prime-review-record.sh`: stores the reviewer's verdict with a **patch fingerprint** (`git patch-id --verbatim` of the branch diff, git 2.39+). A clean rebase keeps the fingerprint; new commits, conflict edits and whitespace changes change it, so the approval no longer counts.
- `prime-merge.sh`: dry-run by default. `--apply`: refuse without APPROVE, with a dirty tree or after a secret-scan hit (exit 3), refuse if the fingerprint changed, rebase on base (`--no-rebase`: exit 4 instead) (conflict, so exit 4 to Codex), re-check the fingerprint, run the gate on the rebased tree, then `merge --no-ff` into the local base in whichever worktree has it checked out (or a temporary one). It never pushes the base branch and never force-pushes. `--apply --pr` pushes the feature branch (no force) and opens a draft PR with `gh`.
- `prime-status.sh`: every worktree with ahead/behind, dirty, gate/review state (`*` = recorded for an older commit), and files changed on more than one branch, the input for merge order.
- `prime-plan.mjs`: the plan checkpoint as a file (see "Plan, queue, ledger"); `accept --by user|reviewer`, `apply --only SLUG --base REF`.
- `prime-run.mjs`: the harness (see "Harness and autopilot").
- `prime-codex.sh`: runs the Codex CLI in the current worktree. `run "<brief>"` edits files in a `workspace-write` sandbox and the caller commits; `review [--base REF]` is a read-only second opinion that ends with a `VERDICT` line. Exit 3 when the CLI is missing; limit `codex.timeoutSec`.
- `prime-queue.mjs`: merge order with predicted conflicts (read-only).
- `prime-cleanup.sh`: dry-run by default; removes clean worktrees of merged branches; `--delete-branches` uses `git branch -d` (merged only); `--include-unmerged` removes clean unmerged worktrees but keeps their branches.

## Plan, queue, ledger (v0.4)

- **Plan** `<main worktree>/.prime/plan.json` (schema `prime.plan.schema.json`, git-excluded). `check`: schema, stream count <= `maxParallelWorktrees`, `minAcceptanceChecks`, repo-relative paths, known dependencies without cycles, and file ownership: two streams may own overlapping paths only when one depends on the other (then it is a warning, because they merge in order). `accept` stores `planHash`; `apply --apply` refuses an unaccepted or edited plan (exit 3) and creates worktrees in topological order, writing role, paths, dependencies and acceptance into `.prime/ownership.json`.
- **Queue** `prime-queue.mjs` runs `git merge-tree --write-tree` for each branch against the base and for each pair of branches that touch the same files, without touching any checkout. Order: plan dependencies, then ready (gate + review recorded for the current commit), base conflicts, pairwise conflicts, overlaps, diff lines. `prime-merge.sh --apply` enforces the dependency part (exit 3; `--ignore-order` overrides).
- **Ledger** `<common-git-dir>/prime/runs.jsonl`: one JSON line per event, shared by all worktrees, never committed. Script events: `worktree.create`, `gate`, `review`, `merge` (`result` = merged / refused / conflict / stale_review / gate_failed / draft_pr), `merge.dryrun`, `plan.accept` (with `by`), `plan.apply`, `cleanup`; since v0.5 also `accept`, `run.merge`, `verify` (harness) and `codex` (`prime-codex.sh`). `prime-team.sh` adds an `agent` event per teammate run (`role`, `name`, `status`, `seconds`; `partial` when it waits on the user); `prime-ledger.sh agent` can still add one by hand with `turns`. `prime-report.mjs` sums them and flags runs that ended `partial`, failed, or exceeded budget; `--strict` exits 1 on any of these.
- **Exit codes** are shared by every script: [exit-codes.md](exit-codes.md).

## Isolation per worktree

`worktree-new.sh` gives each worktree a deterministic dev port (`portBase + cksum(slug) % portRange`), a `.env.worktree` (copied from `.env` when present, plus `PRIME_DEV_PORT`/`PORT`), and `.prime/ownership.json` (paths, DB branch `wt-<slug>`). Both are added to the repo's local `info/exclude`. Rules: one DB branch per worktree (for Supabase, a preview branch), base migrations before feature migrations, never a shared writable DB. The script refuses beyond `maxParallelWorktrees`.

## MCP routing

| Server | Used by | For | Auth | Fallback |
|---|---|---|---|---|
| Perplexity (`api.perplexity.ai/mcp`) | the hub only | research, current facts | sign-in via `/mcp` (OAuth) | WebSearch + WebFetch |
| Context7 (`mcp.context7.com/mcp`) | claude-code, codex, hermes, reviewer | library/API docs | none (optional key) | WebFetch official docs |

## Weakness -> fix

| Weakness (v0.1) | Fix | Since |
|---|---|---|
| No review/test gate before merge | `prime-reviewer`, `prime-gate.sh`, `/prime-review`; merge requires a recorded APPROVE | 0.2.0, enforced in 0.3.0 |
| No conflict process | ownership maps, `/prime-status` overlap report, rebase-before-merge, Codex owns conflicts, patch fingerprint forces re-review | 0.2.0 / 0.3.0 |
| Prime single point of failure | plan checkpoint + re-plan, independent reviewer, decision log | 0.2.0 |
| No budgets | `prime.config.json` + enforced `maxTurns`; worktree cap in `worktree-new.sh` | 0.2.0 / 0.3.0 |
| Shared DB/ports/env | per-worktree port, `.env.worktree`, DB branch rule, migration order | 0.2.0 |
| MCP use undefined | routing table; agents can now actually reach MCP (denylist, not allowlist); fallbacks; doctor fix hints | 0.2.0 / 0.3.0 / 0.4.0 |
| Plan checkpoint only in the prompt | `.prime/plan.json` + `prime-plan.mjs` (accept hash, apply refuses changed plans) | 0.4.0 |
| Merge order a judgement call; conflicts found at rebase | `/prime-queue` with `git merge-tree` prediction; merge refuses unmerged plan dependencies | 0.4.0 |
| Budgets enforced but invisible | run ledger + `/prime-report` (turns vs `maxTurns`) | 0.4.0 |
| A hung gate step could block forever | per-step timeout `stepTimeoutSec` | 0.4.0 |
| Every step waited for a slash command | `prime-workflow` skill on autopilot + `prime-run.mjs` harness; human checkpoints opt-in via `automation` | 0.5.0 |
| Builders checked their own work | harness runs the acceptance checks and gate on the exact commit; reviewer gets a Codex second opinion | 0.5.0 |
| Retries could loop forever | stop after `hardStopOnRepeatedFailures` failed checks or reviews, or a step with no progress | 0.5.0 |
| Streams merged straight into the target, each seen alone | per-run integration branch; `final-review` of the whole diff before one merge into the target (ADR-0004) | 0.6.0 |
| Secrets or out-of-scope files could ride along | secret scan, path ownership, plan checks for gitignored/untracked owned paths | 0.6.0 |

## Changes in v0.3.0

- **Perplexity 401 fixed**: the empty `Bearer ${PERPLEXITY_API_KEY}` header (key not set) caused 401 and blocked OAuth. The plugin now uses sign-in; API key is an opt-in route (README). See ADR-0002.
- **Agents could not use MCP**: `tools:` allowlists hid MCP tools; switched to `disallowedTools`. `color: magenta` (invalid) -> `purple`. `maxTurns` added.
- **Merge rewritten**: v0.2 ran the gate before rebasing and tried to `checkout` the base inside the feature worktree (fails when base is checked out elsewhere). Now: rebase, then gate, then fingerprint check, then merge in the base worktree.
- **New**: `/prime-doctor`, `/prime-status`, `/prime-cleanup`, `prime-review-record.sh`, draft-PR path, GitHub Actions template, JSON schema + validator, bash test suite, CHANGELOG.

## Changes in v0.4.0

- **Plan checkpoint enforced** by `/prime-plan` (ADR-0003).
- **Merge queue** with predicted conflicts, and ordered merges.
- **Ledger + report** of turns per agent vs budget.
- **Hardening**: gate step timeout, shared exit codes, `GIT_TERMINAL_PROMPT=0`, shellcheck-clean scripts, doctor fix hints and 401 guard, feature branches created without upstream tracking (cleanup could not delete them).
- **Tests**: `tests/smoke.sh` end-to-end dry run in a temp repo, plus unit tests for every new script.

## Changes in v0.5.0

- **Removed (breaking)**: the `grok-build` agent. The hub (the `prime-workflow` skill, or `prime-orchestrator` as the main agent) plans and researches itself; Perplexity is routed to the hub only.
- **Autopilot**: the `prime-workflow` skill starts on its own for a multi-part coding goal in a git repo and runs the whole loop with no slash commands. The `/prime-*` commands stay as manual controls.
- **Harness** `prime-run.mjs`: worktrees, acceptance checks, gate, local merges in plan order, cleanup and a final `verify` of the merged base; it stops a stream instead of looping and never pushes.
- **Real Codex CLI** through `prime-codex.sh` (`run` to edit, `review` for a second opinion); the `codex` role drives it, `claude-code` takes over when it is missing.
- **Model tiers**: hub and reviewer on Claude Opus 5.5 (effort max / high), `claude-code` on Claude Sonnet 5.5, `codex` on Claude Haiku 5.5 driving `gpt-6.1-sol` at `xhigh` (until v0.7, where `codex` is the Codex CLI itself as a herdr teammate).
- **Checkpoints**: the reviewer approves the plan and approved branches merge into the local base by default; `automation.planApproval: "user"` and `automation.merge: "ask"` bring the human checkpoints back.

## Changes in v0.6.0

- **Integration branch** `prime/<title>-<hash6>` per run; streams merge into it; the target is untouched until the final merge.
- **Final review gate** (`final-review`): the whole `target...integration` diff is reviewed with a Codex second opinion; one `--no-rebase` merge into the target after APPROVE. A moved target is merged into the integration branch, never rebased.
- **Guardrails:** secret scan (`prime-plan.mjs scan`), path ownership, plan checks for gitignored and untracked owned paths, acceptance re-runs when acceptance or paths change.
- Out of scope: mechanical reviewer-independence enforcement, a maximum diff size beyond the 64MB scan buffer, scanning octopus merges.

## Decision log

`docs/decisions/` holds this plugin's ADRs (0001 review gate, 0002 Perplexity sign-in, 0003 plan file + ledger + merge queue, 0004 final review gate) and `ADR-TEMPLATE.md` for projects that use Prime.
