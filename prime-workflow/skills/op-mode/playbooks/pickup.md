# Pickup

Take over in-flight work from a transcript, branch, worktree or plan.

1. Read the state before acting: `git status`, `git log --oneline -15`, `R/scripts/prime-status.sh`, and `.prime/plan.json` if it exists.
2. Read the latest handoff note or the last messages of the prior session, and the decision trail (`R/scripts/prime-ledger.sh tail 40`).
3. List what is done, what is in progress, and what is unverified. Treat a prior "done" as unverified until you run its check.
4. Re-run the last acceptance check or test to learn where it really stands.
5. Continue in the Router's playbook for what remains, with the consolidated brief: the original goal, every later directive, and what step 3 found.
