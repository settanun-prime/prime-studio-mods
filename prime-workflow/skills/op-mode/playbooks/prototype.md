# Prototype

Settle a fork by observing it instead of asking. The sketch is thrown away; the finding is kept.

1. Write the question as one falsifiable sentence and the result that would decide it.
2. Build the smallest sketch that can show the difference, outside the real code path (a scratch file or a throwaway branch).
3. Build the competing sketch the same way when there are two or more options.
4. Run each under the same conditions and capture the output, timing or screenshot.
5. Decide from the evidence, and record it: `R/scripts/prime-ledger.sh decision "<choice>" --why "<what the run showed>"`.
6. Delete the sketches. Check: `git status` shows none of them.
7. Continue in the playbook that asked, with the decision as input.
