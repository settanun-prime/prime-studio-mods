# Autonomous run

Drive one task to a stated predicate while the user is away.

1. Write the stop predicate as a command and its expected result (for example `npm test` exits 0, or a metric reaches a target).
2. Pick the work playbook from the Router and copy its steps after these.
3. Several parts: hand them to the Prime autopilot (`prime-workflow` skill) with `prime-bg.sh`, so the run outlives this session.
4. Log every non-obvious decision with `R/scripts/prime-ledger.sh decision` as you make it.
5. After each unit of work, run the predicate. Stop when it holds, or after 3 attempts on the same premise with no progress, and say why.
6. Pauses still apply: never push, deploy or delete data during the run.
7. Report: the predicate's final result, `node R/scripts/prime-report.mjs`, and every open question left for the user.
