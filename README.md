# Prime Studio mods

Claude Code plugins from Prime Studio.

| Plugin | What it does | Version |
|---|---|---|
| `prime-guard` | Redacts Thai and international personal data before it is sent, masks it on screen, keeps secret files closed, refuses publishing personal data or secrets, optional global git hooks that block a push carrying this PC's network or personal data | 1.2.0 |
| `prime-ctbar` | Context window breakdown and prompt-cache countdown with interactive compact button | 1.1.2 |
| `prime-agents-panel` | Side pane listing project, user and plugin agents with a run button each | 1.0.1 |
| `prime-workflow` | Multi-agent workflow autopilot with git worktree isolation, herdr agent team, review gate, and `/op-mode` rigor router | 1.1.1 |

Install:

```bash
claude plugin marketplace add settanun-prime/prime-studio-mods
claude plugin install prime-guard@prime-studio-mods
claude plugin install prime-ctbar@prime-studio-mods
claude plugin install prime-agents-panel@prime-studio-mods
claude plugin install prime-workflow@prime-studio-mods
```

Git guard ทุก repo บนเครื่อง (prime-guard 1.2.0): `/prime-guard git on` ตั้ง `core.hooksPath` ของ git ไปที่ `prime-guard/git-hooks` แล้วทุก push บนเครื่องถูกสแกนก่อนออก ทั้งใน Claude Code และนอก Claude Code เจอ key, token, IP/MAC ของ LAN, ชื่อเครื่อง, ชื่อ Tailscale, path โปรไฟล์ Windows หรือ e-mail จริง = บล็อก `/prime-guard git off` ปิด, `--no-verify` ข้ามครั้งเดียว รายละเอียด: [prime-guard/git-hooks/README.md](prime-guard/git-hooks/README.md)

Best effort, not legal advice. Detection runs locally; the redacted conversation still goes to your model provider.

License: MIT (see LICENSE).
