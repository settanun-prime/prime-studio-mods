# Prime Quickstart (English)

[ภาษาไทย](QUICKSTART.md)

Since v0.5, Prime runs on autopilot: install it, then ask for what you want in plain words. Part A is the automatic path; part B is the manual `/prime-*` path, one step at a time, which still works.

# A. Autopilot

## 1. Install and check

```bash
claude plugin marketplace add settanun-prime/prime-studio-mods
claude plugin install prime-workflow@prime-studio-mods
```

Restart Claude Code, then in your repo type `/prime-doctor`. Every WARN/FAIL line comes with a `fix:` hint. You need git 2.39+, node and [herdr](https://herdr.dev): Prime runs its agent team on herdr only (a hub started outside herdr hands off to it with `scripts/prime-bg.sh`).

Hermes Agent is optional: give Prime its own profile with `hermes profile create prime --clone-from default --no-alias`. Without it, `hermes` streams go to `claude-code`.

The Codex CLI is optional. With it, the `codex` role hands multi-file work to Codex and the reviewer gets a Codex second opinion:

```bash
npm install -g @openai/codex
codex login
```

Without it, `/prime-doctor` warns, the `codex` role's streams go to `claude-code`, and the reviewer reviews alone. Model and effort: `prime.config.json` → `codex` (`gpt-6.1-sol`, reasoning `xhigh`), or `PRIME_CODEX_MODEL` / `PRIME_CODEX_EFFORT`.

Perplexity is optional: `/mcp` -> `plugin:prime-workflow:perplexity` -> sign in. Without it, the hub uses WebSearch.

## 2. Ask for the goal

In a git repo, describe the goal in plain words, for example:

```text
Add card checkout: an order API and a checkout page, with tests. No coupons.
```

No slash command is needed: the `prime-workflow` skill starts on its own for a goal that spans several files or parts (not for questions or one-line edits). For a fully automatic session, start Claude Code with `claude --agent prime-workflow:prime-orchestrator`. You can also just say "use Prime".

## 3. What it does

1. **Plan.** Prime, the hub (Claude Opus), writes `.prime/plan.json` (never committed): streams, owned paths, `dependsOn`, and acceptance commands that fail until the work is done. See the example below.
2. **Plan approval.** `prime-reviewer` (Claude Opus) checks the plan and approves it, or sends it back to the hub with a fix list.
3. **Build.** The harness (`scripts/prime-run.mjs`) creates one worktree per stream in dependency order. `claude-code` (Claude Code on Sonnet), `codex` (the Codex CLI) or `hermes` (Hermes Agent, profile `prime`) builds each stream and commits; each builder is a teammate in its own herdr tab and keeps that tab for the stream's `fix`.
4. **Checks.** The harness runs the stream's acceptance checks and the gate (lint/typecheck/test) on that exact commit. A failure goes back to the builder as `fix`.
5. **Review.** `prime-reviewer` reviews the branch with a Codex second opinion. On APPROVE the harness merges it into the run's **integration branch** (`prime/<title>-<hash6>`), one stream at a time in plan order; your base is not touched yet. Checks also cover the secret scan and "only files under the stream's paths". A conflict goes to `codex`, and the branch is checked and reviewed again.
6. **Verify.** After the last stream the harness removes the stream worktrees, opens a final worktree on the integration branch and runs every acceptance check, the gate and a paths check on the integration head (in the main checkout when it is on that branch, otherwise in a temporary worktree).
7. **Final review.** `prime-reviewer` (with a Codex second opinion) reviews the whole base...integration diff (`final-review`). On APPROVE the harness makes the one merge into your **local** base (`--no-rebase`; if the base moved, `codex` merges it into the integration branch first, never a rebase). On REQUEST_CHANGES the plan gains a fix stream under a new slug and the merged streams stay in the plan. Then Prime reports each stream, the verify result, the local base commit and turns used vs budget.

Nothing is pushed: pushing, PRs and deploying stay your call. A stream that fails its checks or review 3 times, or a step that makes no progress, stops; Prime tells you which stream and why, and keeps going with the others.

Example plan:

```json
{
  "version": 1,
  "title": "Checkout",
  "status": "draft",
  "goal": "Users can pay by card",
  "nonGoals": ["coupons"],
  "base": "main",
  "streams": [
    { "slug": "checkout-api", "role": "claude-code", "summary": "Order creation API",
      "paths": ["src/api/checkout/"], "dependsOn": [],
      "acceptance": ["npm test -- src/api/checkout"] },
    { "slug": "checkout-ui", "role": "claude-code", "summary": "Checkout page",
      "paths": ["src/app/checkout/"], "dependsOn": ["checkout-api"],
      "acceptance": ["npm test -- src/app/checkout"] }
  ],
  "risks": ["order schema change"]
}
```

Each `acceptance` entry is a shell command run from the worktree root; exit 0 means pass.

## 4. Turn on checkpoints

By default nothing waits for you between the request and the final report. To get the human checkpoints back, set `automation` in the plugin's `prime.config.json` (it is the plugin's own file, so check it again after a plugin update):

```json
"automation": { "planApproval": "user", "merge": "ask" }
```

- `planApproval: "user"`: Prime shows the plan and waits for your OK before any worktree is created.
- `merge: "ask"`: Prime asks before each merge into the local base.

Use either one or both.

## 5. Watch or preview

- `/prime-status`: every worktree, ahead/behind, gate and review state.
- `/prime-report`: gates, reviews, merges and turns used per agent vs budget.
- To see the next steps without changing anything, ask Claude to run `node ${CLAUDE_PLUGIN_ROOT}/scripts/prime-run.mjs` (no `--apply`). `prime-run.mjs verify` runs every acceptance check and the gate on the base now.

# B. Manual, one step at a time

The `/prime-*` commands still run each step yourself. Every step that changes something is a dry-run first.

## 1. Plan (the checkpoint)

```text
/prime-plan init "Checkout"
```

Prime (the hub) writes the plan to `.prime/plan.json`, like the example in A.3.

`/prime-plan check` validates: schema, stream count within budget, at least `minAcceptanceChecks` acceptance checks per stream (default 1), relative paths only, known and acyclic `dependsOn`, and **no two streams owning the same path** unless one depends on the other.

Review the plan and say OK. Prime then runs `accept` and `apply --apply`, which creates the worktrees in dependency order, each with `.prime/ownership.json`. Edit the plan after accepting and you must `check` + `accept` again (apply refuses with exit 3).

## 2. Work in parallel

- `claude-code`, `codex` or `hermes` works in its own worktree (own port, `.env.worktree`, DB branch `wt-<slug>`), as a teammate in its own herdr tab.
- `prime-team.sh` records each teammate run in the ledger.
- `/prime-status` for an overview.

## 3. Merge order

```text
/prime-queue
```

Ordered by plan dependencies -> ready (gate + review match the current commit) -> predicted conflict with base -> conflicts between branches -> size. Conflicts are predicted with `git merge-tree` without touching any checkout. The `next:` line is the branch to merge first.

## 4. Review and merge

```text
/prime-review checkout-api
/prime-merge checkout-api            # dry-run
/prime-merge checkout-api --apply    # rebase -> gate -> fingerprint check -> merge into the local base
```

- exit 3: refused (no APPROVE, dirty tree, plan dependency not merged yet, secret scan hit, a plan stream aimed at any base but its integration branch)
- exit 4: rebase conflict, or with `--no-rebase` the base moved -> hand to `codex`, then review again
- exit 5: code changed after the review -> review again

Prime never pushes the base and never force-pushes. For a PR: `--apply --pr` (draft).

## 5. Report and clean up

```text
/prime-report     # gates/reviews/merges and turns used per agent vs budget
/prime-cleanup    # dry-run; --apply removes merged worktrees
```

All exit codes: [exit-codes.md](exit-codes.md)
