# Pause

Stop so that another session can resume with no guessing.

1. Bring the working tree to a state that builds, or note exactly what does not.
2. Commit work in progress to the current non-base branch only when the user allowed commits; otherwise leave it in the tree and say so.
3. Write the handoff: the goal, what is done (with the check that proved it), what is next, open questions, and the exact command to resume. Put it in the reply, and in the ledger when in a repo: `R/scripts/prime-ledger.sh decision "pause: <next step>" --why "<state>"`.
4. A running Prime autopilot keeps running in herdr. Say how to reach it (`herdr agent read <name>`) instead of stopping it.
5. Check: someone reading only the handoff could run the resume command.
