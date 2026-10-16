---
name: prime-principles
description: Prime engineering principles adapted from pstack (poteto-mode). Enforces the Laziness Protocol (YAGNI, minimal diffs, stdlib first), Domain Modeling, Blast Radius Analysis, Scientific Verification (Prove It Works), Stream Playbooks, Adversarial Interrogation, and Anti-Slop / No-Comment hygiene across all Prime agents.
---

# Prime Engineering Principles (v0.8)

Adapted from high-rigor engineering playbooks (pstack/poteto-mode), tailored for Prime's multi-agent autopilot workflow. Every role (`prime-orchestrator`, `prime-reviewer`, `claude-code`, `codex`, `hermes`) adheres to these principles.

---

## 1. The Prime Mindset: Radical Simplicity & Maximum Rigor

1. **The Best Code is No Code**:
   - The most reliable, bug-free, zero-maintenance line of code is the one you never write.
   - Before writing any code, ask: "Can this problem be solved by deleting code, using an existing function, or leveraging the standard library?"
2. **Laziness Protocol (YAGNI & Minimalism)**:
   - Implement the minimum code required to solve the immediate problem. Zero speculation.
   - Standard library before custom code. Native platform features before dependencies. One line before fifty.
   - No premature abstractions: do not create interfaces, factory functions, or base classes for logic used only once.
   - If you wrote 100 lines for a 20-line problem, stop and rewrite it.
3. **Subtract Before You Add**:
   - Simplify by removing obsolete code, unused parameters, dead branches, and speculative layers.
   - When modifying code, clean up any dead code your change creates (orphaned variables, unused imports).

---

## 2. Architecture & Domain Modeling

1. **Model the Domain**:
   - Model the real problem using rich types and precise domain terminology.
   - Make invalid states unrepresentable through type definitions and data structures.
   - Avoid primitive obsession (e.g., passing loose strings and booleans when a structured union or value object expresses the invariants).
2. **Boundary Discipline**:
   - Explicit inputs and outputs. Isolate side effects to the boundaries of the system.
   - Every stream owns explicit file paths (`paths` in `.prime/plan.json`). An agent must never touch files outside its assigned boundary.
   - Zero collateral damage: never reformat unrelated lines, rename adjacent symbols, or "fix typos" outside your assigned scope.
3. **Idempotence & Predictability**:
   - Operations, migrations, and scripts must be safely repeatable.

---

## 3. Pre-Coding Blast Radius Mapping

Before writing code or finalizing a plan stream, map the blast radius:
1. **Direct Touch**: Exactly which files and symbols will be created or modified?
2. **Callers & Dependents**: Who calls these symbols? What UI, API, or background workers consume them?
3. **Shared State**: Does this touch shared database tables, schemas, migrations, caches, environment variables, or ports?
4. **Disjoint Paths & Ordering**: If two streams touch overlapping files or shared contracts, they CANNOT run in parallel without an explicit `dependsOn` relationship.
5. **Containment**: If this change fails at runtime, what is the blast radius? Can it corrupt state, leak secrets, or block other streams?

---

## 4. The 5 Stream Playbooks

Every stream in `.prime/plan.json` follows one of these 5 structured playbooks:

### A. Feature Playbook
*Use when building new capabilities or user-facing features.*
1. **Domain Model**: Define the core entities, types, and invariants first.
2. **Contract / Interface**: Define clean, minimal APIs or schemas.
3. **Acceptance Test First**: Write a runnable acceptance test command that fails on current HEAD without the feature.
4. **Surgical Implementation**: Write the minimal code necessary to make the acceptance test pass.
5. **Runtime Verification**: Run the acceptance command; capture exit code 0 and actual runtime output.

### B. Bug Fix Playbook
*Use when fixing defects, regressions, or unexpected behaviors.*
1. **Reproduce First**: Write an automated test or reproduction script that reliably reproduces the bug and FAILS on current HEAD.
2. **Root-Cause Analysis**: Trace the defect to its fundamental cause. Do not patch superficial symptoms with defensive null checks or workaround flags.
3. **Surgical Fix**: Apply the minimal change required to fix the root cause.
4. **Regression Verification**: Prove that the reproduction test now PASSES and all existing tests continue to pass.

### C. Refactor Playbook
*Use when improving structure, removing technical debt, or consolidating code without changing external behavior.*
1. **Safety Net**: Confirm that existing acceptance tests pass and cover the behavior before touching anything.
2. **Behavior Preservation**: Strictly zero external contract changes, zero new features.
3. **Subtract & Consolidate**: Delete dead code, inline single-use abstractions, simplify convoluted logic.
4. **Step-by-Step Verification**: Run tests after each atomic refactoring step.

### D. Performance Playbook
*Use when optimizing execution speed, memory footprint, or bundle size.*
1. **Baseline Measurement**: Measure real-world latency, memory, or throughput before changing anything. Never optimize on intuition.
2. **Single Hypothesis**: Identify the single bottleneck supported by profiling data.
3. **Targeted Optimization**: Apply the simplest surgical optimization addressing that bottleneck.
4. **Delta Proof**: Re-measure under identical conditions to prove the exact metric improvement.

### E. Investigation Playbook
*Use when exploring unknown systems, diagnosing intermittent failures, or evaluating architectural options.*
1. **Read-Only Exploration**: Inspect code, configuration, and telemetry without modifying repo state.
2. **Evidence Gathering**: Collect exact logs, stack traces, and configuration states.
3. **Blast Radius Assessment**: Document affected modules, blast radius, and dependencies.
4. **Actionable Output**: Deliver a clear root-cause explanation or a concrete set of follow-up streams for `.prime/plan.json`.

---

## 5. Verification: "Prove It Works"

1. **Runtime Evidence Over Declarations**:
   - Never say "it works" or "it compiles" without running the command.
   - Always report the exact command run, the exit code, and the relevant terminal output.
2. **Test Observable Behavior**:
   - Test what the code actually does from the user or caller perspective.
   - Avoid over-mocking: tests that merely verify mock interactions provide zero confidence that the system works in production.
3. **Acceptance Criteria Must Be Falsifiable**:
   - If an acceptance test passes even before the code is written, it is invalid.

---

## 6. Adversarial Interrogation (Review Discipline)

Reviewers (`prime-reviewer` and the Codex second opinion) are not cheerleaders or rubber-stamps. They are adversarial interrogators:
1. **Challenge Assumptions**:
   - What happens when inputs are null, empty, negative, or malformed?
   - What happens on network failure, timeout, or database disconnection?
   - Are there concurrent race conditions?
2. **Audit Blast Radius**:
   - Did the author touch any file outside `.prime/ownership.json`?
   - Did the author introduce breaking changes to shared interfaces or database schemas?
3. **Interrogate the Proof**:
   - Did the author run the acceptance test? Where is the evidence?
   - Did the author add tests for new failure modes?
4. **Independent Second Opinion**:
   - Always run `${CLAUDE_PLUGIN_ROOT}/scripts/prime-codex.sh review --base <base>` to cross-examine findings from an independent model.

---

## 7. Anti-Slop & Comment Hygiene

1. **Zero AI Slop**:
   - No conversational filler, pleasantries, or sycophancy ("Sure thing!", "I'm happy to help!", "Here is a clean implementation").
   - Direct, factual, dense communication. State findings, evidence, and actions.
2. **No-Comments Rule (Self-Documenting Code)**:
   - Code must explain itself through clear names, domain types, and clean structure.
   - **Delete immediately**:
     - Comments describing what syntax does (`// increment i`, `// check if user exists`, `// return result`).
     - Comments restating function names (`// getUser fetches the user`).
     - Dead commented-out code.
     - Vague speculative TODOs (`// TODO: maybe handle this later`).
   - **Keep only load-bearing comments**:
     - Non-obvious domain rules or business requirements.
     - Known external bugs, platform quirks, or upstream workarounds with issue links.
     - Critical security or mathematical invariants.
