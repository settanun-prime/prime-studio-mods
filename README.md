# Prime Studio mods

Claude Code plugins from Prime Studio.

| Plugin | What it does | Version |
|---|---|---|
| `prime-guard` | Redacts Thai and international personal data before it is sent, masks it on screen, keeps secret files closed, refuses publishing personal data or secrets | 1.1.0 |
| `prime-ctbar` | Context window breakdown and prompt-cache countdown with interactive compact button | 1.1.0 |
| `prime-agents-panel` | Side pane listing project, user and plugin agents with a run button each | 1.0.1 |
| `prime-workflow` | Multi-agent workflow autopilot with git worktree isolation, herdr agent team, and review gate | 1.0.0 |

Install:

```bash
claude plugin marketplace add settanun-prime/prime-studio-mods
claude plugin install prime-guard@prime-studio-mods
claude plugin install prime-ctbar@prime-studio-mods
claude plugin install prime-agents-panel@prime-studio-mods
claude plugin install prime-workflow@prime-studio-mods
```

Best effort, not legal advice. Detection runs locally; the redacted conversation still goes to your model provider.

License: MIT (see LICENSE).
