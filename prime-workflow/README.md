# prime-workflow (Prime) v1.1.0

[ไทย](#ไทย) · [English](#english)

---

<a id="ไทย"></a>
## ไทย

มอด Prime สำหรับ Claude Code และ Codex: บอกเป้าหมายเป็นภาษาธรรมดา แล้ว Prime ทำต่อเองจนจบโดยไม่ต้องพิมพ์ slash command คือวางแผน แยก worktree ต่อ stream พร้อม port/env/DB ของตัวเอง ให้ agent หลายตัวทำงานคู่ขนาน ตรวจ acceptance และ lint+typecheck+test รีวิวทุก branch ก่อน merge เข้า base ในเครื่อง แล้วตรวจ base ที่รวมแล้วอีกรอบ งานเดินตามเฟส SDLC ที่มีเกณฑ์ผ่านทุกเฟส Context7 MCP และ Perplexity MCP ต่ออัตโนมัติ (ทั้งคู่ไม่บังคับ มี fallback)

> `claude-code`, `codex` และ `hermes` คือชื่อ **บทบาท agent** ในมอดนี้ role `codex` คือ Codex CLI ในเครื่องคุณ ซึ่งใช้การล็อกอินของคุณเอง ถ้าไม่มี CLI (หรือไม่มี profile ของ Hermes) งานของ role นั้นจะย้ายไปให้ `claude-code`

### ติดตั้ง

```bash
claude plugin marketplace add settanun-prime/prime-studio-mods
claude plugin install prime-workflow@prime-studio-mods
```

รีสตาร์ท Claude Code แล้วรัน `/prime-doctor` (หรือ `/prime-setup`) จากนั้นบอกเป้าหมายได้เลย เริ่มใช้งาน: [docs/QUICKSTART.md](docs/QUICKSTART.md)

ต้องมี [herdr](https://herdr.dev) (บังคับ): Prime รันทีม agent บน herdr เท่านั้น ทุกบทบาทเป็นเพื่อนร่วมทีม (teammate) ในแท็บของตัวเองใน workspace ของ hub ถ้าเริ่ม hub นอก herdr มันจะส่งต่องานไปรันใน herdr เองด้วย `scripts/prime-bg.sh`

Hermes Agent (ไม่บังคับ): สร้าง profile ของ Prime แยกไว้ เพื่อให้ memory ของ Prime ไม่ปนกับงาน Hermes อื่น `hermes profile create prime --clone-from default --no-alias` ถ้าไม่มี stream ของ `hermes` จะย้ายไปให้ `claude-code`

### Codex CLI (ไม่บังคับ)

```bash
npm install -g @openai/codex
codex login
```

ถ้ามี role `codex` คือ Codex CLI ตัวจริงที่รันเป็น teammate ในแท็บ herdr รับงานที่แตะหลายไฟล์และการแก้ conflict และ reviewer จะได้ความเห็นที่สองจาก Codex (ผ่าน `scripts/prime-codex.sh review`) ถ้าไม่มี `/prime-doctor` จะเตือน งาน build/fix ของ `codex` จะย้ายไปให้ `claude-code` (ส่วนงานแก้ conflict หรือ `resolve` จะหยุดรอคุณ) และ reviewer จะรีวิวคนเดียว ตั้งโมเดล/effort ได้ที่ `prime.config.json` → `codex` หรือ `PRIME_CODEX_MODEL` / `PRIME_CODEX_EFFORT`

### โหมดอัตโนมัติ

ใน git repo บอกเป้าหมายที่แตะหลายไฟล์หรือหลายส่วน skill `prime-workflow` จะเริ่มเอง (หรือเปิด session ด้วย `claude --agent prime-workflow:prime-orchestrator`) Prime เขียนแผน ให้ reviewer อนุมัติ แล้ววนเรียก harness `scripts/prime-run.mjs` ซึ่งทำขั้นที่เป็นกลไกเองทั้งหมด: สร้าง worktree, รัน acceptance, รัน gate, merge แต่ละ stream เข้า integration branch ของรอบงาน (`prime/<ชื่อ>-<hash6>`) ตามลำดับในแผน, เก็บกวาด, ตรวจ (`verify`) แล้วให้ reviewer รีวิว diff ทั้งก้อน (`final-review`) ก่อน merge เข้า base ในเครื่องครั้งเดียว ส่วนงานที่ต้องคิดจะส่งให้ agent ตามตารางนี้ แต่ละตัวเป็น teammate ในแท็บ herdr ของตัวเอง สั่งงานผ่าน `scripts/prime-team.sh` (ไม่ใช้ subagent)

| บทบาท | โมเดล | หน้าที่ |
|---|---|---|
| hub (skill `prime-workflow`, `prime-orchestrator`) | Claude Opus 5.5, effort max ใน pane ของ herdr | เก็บ requirement, ค้นข้อมูล, วางแผน, สั่งงาน |
| `prime-reviewer` | Claude Code (Opus 5.5, effort high) | อนุมัติแผน, รีวิวแต่ละ branch โดยมีความเห็นที่สองจาก Codex |
| `claude-code` | Claude Code (Sonnet 5.5, effort high) | เขียนโค้ดและแก้งานที่ขอบเขตชัด |
| `codex` | Codex CLI (`gpt-6.1-sol`, reasoning `xhigh`) | งานที่แตะหลายไฟล์และแก้ conflict |
| `hermes` | Hermes Agent, profile `prime` (memory ของ Prime เอง) | stream ที่ทำจบในตัว เป็นคนทำงานคนที่สามข้าง Claude Code และ Codex |

Base (เช่น `main`) ไม่ถูกแตะจนกว่า `final-review` จะ APPROVE ถ้า base ขยับระหว่างนั้น `codex` จะ merge base เข้า integration branch (ไม่ rebase) ถ้าผู้รีวิวขอแก้ แผนจะเพิ่ม fix stream ใต้ slug ใหม่โดยเก็บ stream ที่ merge แล้วไว้ในแผน

ตัวป้องกันที่ harness บังคับ: ตรวจ secret (`prime-plan.mjs scan`) บน diff และทุก commit รวมไฟล์ `.env*` (ข้ามบรรทัดที่มี `prime-allow-secret`), ไฟล์ที่ stream แก้ต้องอยู่ใน `paths` ของมัน, plan ปฏิเสธ path ที่ถูก gitignore หรือยังไม่ได้ track, และ stream merge เข้าได้เฉพาะ integration branch

ข้อจำกัดที่รู้อยู่: การตรวจไฟล์ของ plan อ่าน working tree ของ checkout หลัก ไม่ใช่ branch `base` ของแผน ให้ `.gitignore` ของ checkout หลักตรงกับ base และใช้ `/` ท้าย path ที่เป็นโฟลเดอร์; `maxParallelWorktrees` นับ stream ที่ merge แล้วด้วย แผนที่เต็มจำนวนพอดีจึงเพิ่ม fix stream หลัง REQUEST_CHANGES ไม่ได้ ให้เว้นไว้หนึ่ง stream; ยังไม่ปฏิเสธกรณี `integration === target`; นอกขอบเขต: บังคับความเป็นอิสระของ reviewer แบบกลไก, ขนาด diff สูงสุดเกินบัฟเฟอร์สแกน 64MB, การสแกน octopus merge

ในโหมดนี้ Prime ไม่ push ไม่เปิด PR และไม่ deploy ถ้า stream ไหนไม่ผ่านการตรวจหรือรีวิวครบ 3 ครั้ง หรือขั้นไหนไม่คืบหน้า stream นั้นจะหยุด แล้ว Prime รายงานว่าหยุดเพราะอะไร ถ้าอยากให้หยุดถามก่อนอนุมัติแผนหรือก่อน merge ให้ตั้ง `automation` ใน `prime.config.json` (`planApproval: "user"`, `merge: "ask"`) ดูล่วงหน้าโดยไม่เปลี่ยนอะไร: `node scripts/prime-run.mjs` (ไม่ใส่ `--apply`)

### หลักการวิศวกรรม Prime Principles & Playbooks (v0.8)
ยกระดับความแม่นยำและระเบียบวิศวกรรมระดับสูง (ถอดแบบแนวคิดจาก Cursor `pstack` / `poteto-mode` ดูรายละเอียดที่ `skills/prime-principles/SKILL.md`):
- **Laziness Protocol (YAGNI & Minimalism)**: เขียนโค้ดน้อยที่สุดเท่าที่แก้ปัญหาได้จริง ไม่สร้าง abstraction ล่วงหน้า ใช้ standard library และฟีเจอร์ของแพลตฟอร์มก่อน dependencies ลบโค้ดที่ไม่จำเป็นออกก่อนเพิ่ม
- **Domain Modeling & Boundary Discipline**: ใช้โมเดลและ type ที่ชัดเจนแทน primitive loose strings ทำให้สถานะที่ไม่ถูกต้องแสดงผลไม่ได้ (unrepresentable states) แต่ละ stream มีขอบเขตไฟล์ (`paths`) ชัดเจน ห้ามแตะไฟล์นอกขอบเขต
- **Pre-Coding Blast Radius Mapping**: วิเคราะห์และทำแผนผังผลกระทบล่วงหน้า (Blast Radius) ทั้งโมดูลที่เกี่ยวข้อง, callers, ฐานข้อมูล, schema migration, env vars, ports ก่อนเริ่มเขียนโค้ด
- **5 Stream Playbooks**: แบ่งงานแต่ละ stream ตาม playbook ที่เหมาะสม: `feature` (Domain model -> Contract -> Test-first -> Minimal code), `bug-fix` (เขียนเทสต์จำลองข้อผิดพลาดก่อน -> หาสาเหตุที่แท้จริง -> แก้เฉพาะจุด), `refactor` (คงพฤติกรรมภายนอก 100% -> ตัด dead code), `perf` (วัด baseline ก่อน -> ตั้งสมมติฐานเดี่ยว -> ปรับจูน -> วัดผลต่าง), `investigation` (สำรวจแบบ read-only -> เก็บหลักฐาน)
- **Scientific Verification ("Prove It Works")**: ไม่รับคำกล่าวอ้างโดยไม่มีหลักฐาน ต้องรัน acceptance test จริง และแสดงผลลัพธ์พร้อม exit code 0
- **Adversarial Interrogation**: ผู้รีวิวไม่ประทับตรารับรองแบบผ่านๆ แต่ตรวจสอบเชิงซักค้าน (edge cases, failure modes, race conditions, blast radius leakage) ร่วมกับความเห็นที่สองจาก Codex
- **Anti-Slop & Comment Discipline**: กำจัดคำพูดเยิ่นเย้อของ AI และห้ามใส่คอมเมนต์ขยะที่อธิบายไวยากรณ์ธรรมดา โค้ดต้องสื่อความหมายด้วยตัวเอง (self-documenting)

### op mode: `/setup-op` และ `/op-mode`
ตัวรวมที่รู้ว่างานแต่ละแบบต้องทำอะไรและใช้ skill ไหน ดัดแปลงจาก `pstack` ของ Cursor (`/setup-pstack`, `/poteto-mode`, MIT) ให้ทำงานร่วมกับ Prime
1. `/setup-op` เลือกงบการคิด (`unlimited`, `large`, `medium`, `small`) และ model ต่อบทบาท (`hub`, `hardest`, `builder`, `reviewer`, `verifier`, `explorer`, `codex`) เก็บที่ `~/.claude/op/models.json`
2. `/op-mode` ใช้เมื่องานต้องการความรัดกุม: จัดประเภทงาน เปิด playbook เป็น task list โหลดเฉพาะ skill ที่ playbook ต้องใช้ (ถ้า skill นั้นไม่ได้ติดตั้งก็ใช้ส่วนที่มากับ prime-principles แทน) ให้ subagent ใช้ model ตามตาราง งานหลายส่วนส่งต่อให้ Prime autopilot และพิสูจน์ผลก่อนรายงาน

ส่วนที่ทำเพิ่มจาก pstack:
- งบกับ model แยกกัน และ `scripts/op-config.mjs` เป็นตัวคำนวณ effort และตรวจค่า (มีเทสต์) ไม่ได้อาศัยคำอธิบายในพรอมต์ ค่าผิดถูกปฏิเสธด้วย exit 2
- ตารางเดียวกันใช้ทั้ง subagent ใน `/op-mode` และทีม herdr (`prime-team.sh`, `prime-bg.sh`) ลำดับของ Codex คือ env, `/setup-op` แล้วจึง config ของ plugin ถ้ายังไม่ได้รัน `/setup-op` ทุกอย่างทำงานแบบเดิม
- งานหลายส่วนเข้า harness `prime-run.mjs` ซึ่งมี gate จริง (acceptance, secret scan, path ownership, reviewer, final review) ไม่ใช่ playbook ที่เป็นข้อความอย่างเดียว
- บันทึกการตัดสินใจลง ledger: `prime-ledger.sh decision "<เลือกอะไร>" --why "<หลักฐาน>"` แล้ว `prime-report.mjs` แสดงรายการ
- เทสต์โครงสร้างตรวจว่า playbook, หัวข้อใน prime-principles, script และบทบาทที่ `/op-mode` อ้างถึงมีอยู่จริง

### ติดตั้งใน Codex

```bash
codex plugin marketplace add settanun-prime/prime-studio-mods
codex plugin add prime-workflow@prime-studio-mods
```

Codex ไม่มี slash command ของปลั๊กอิน ให้สั่งเป็นประโยค เช่น "ทำงานนี้ด้วย Prime" skill `prime-workflow` จะทำงานอัตโนมัติแบบเดียวกัน และถ้าต้องสั่งทีละขั้นจะเปิด `commands/prime-<ขั้น>.md` แล้วรันสคริปต์ชุดเดียวกัน hub ต้องรันใน pane ของ herdr และสั่งงานทีมด้วย `scripts/prime-team.sh` เหมือน hub ของ Claude ส่วน reviewer ต้องแยกจากบริบทที่เขียนโค้ด ต้องเป็น teammate `prime-reviewer` ตัวใหม่เสมอ โดยใช้ `scripts/prime-codex.sh review --base <base>` เป็นความเห็นที่สอง `maxTurns` บังคับได้เฉพาะใน Claude Code การสร้าง worktree และ merge เขียนนอก workspace จึงอาจต้องกดอนุมัติ ส่วน Perplexity ให้ sign in ด้วย `codex mcp login perplexity`

### คำสั่ง

โหมดอัตโนมัติไม่ต้องใช้คำสั่งเหล่านี้ แต่ยังใช้ดูสถานะหรือสั่งเองทีละขั้นได้

| คำสั่ง | หน้าที่ |
|---|---|
| `/prime-setup` | ตั้งค่าครั้งแรก (Perplexity sign-in, CI template) |
| `/prime-doctor` | ตรวจสุขภาพ: git, gh, claude, node, Codex CLI, MCP, คีย์ (มี/ไม่มี), config, แผน, ledger พร้อมวิธีแก้ (`fix:`) |
| `/prime-plan` | checkpoint: เขียน/ตรวจ/accept `.prime/plan.json` (stream, เจ้าของไฟล์, dependency, acceptance) แล้วสร้าง worktree ตามลำดับ |
| `/prime-worktree <slug>` | สร้าง worktree พร้อม isolation |
| `/prime-status` | สถานะทุกสาขา: ahead/behind, gate/review, ไฟล์ที่ชนกัน |
| `/prime-queue` | ลำดับ merge: dependency ในแผน, พร้อมหรือยัง, ทำนายการชนด้วย `git merge-tree`, ขนาด (อ่านอย่างเดียว) |
| `/prime-review` | รัน gate + reviewer บันทึกคำตัดสิน |
| `/prime-merge` | dry-run เป็นค่าเริ่มต้น; `--apply` รวมเข้า base ท้องถิ่น (ปฏิเสธถ้า dependency ในแผนยังไม่ merge หรือ secret scan พบ; stream ของแผน merge ได้เฉพาะเข้า integration branch); `--no-rebase` ออกด้วย 4 แทนการ rebase เมื่อ base ขยับ; `--apply --pr` เปิด draft PR |
| `/prime-cleanup` | ลบ worktree ที่ merge แล้ว (dry-run เป็นค่าเริ่มต้น) |
| `/prime-report` | สรุปจาก ledger: gate/review/merge และ turn ที่แต่ละ agent ใช้เทียบงบ `maxTurns` |

### Ledger

ทุกสคริปต์บันทึกเหตุการณ์ลง `<git common dir>/prime/runs.jsonl` (ในเครื่อง ไม่เข้า git ไม่ส่งออกไปไหน) `scripts/prime-team.sh` บันทึกการรันของ teammate แต่ละตัวเอง (บันทึกเองได้ด้วย `scripts/prime-ledger.sh agent <role> --turns N`) ปิดได้ด้วย `PRIME_LEDGER=0`

### Perplexity (ไม่บังคับ)

มอดต่อ `https://api.perplexity.ai/mcp` แบบ sign-in (OAuth) ตาม[เอกสารของ Perplexity](https://docs.perplexity.ai/docs/getting-started/integrations/mcp-server) (ตรวจสอบ 2026-10-08):

1. ใน Claude Code รัน `/mcp`
2. เลือก `plugin:prime-workflow:perplexity` แล้ว sign in
3. ต้องเป็น admin ของ Perplexity API organization ที่มีการเรียกเก็บเงิน

ถ้ายังไม่ sign in hub จะใช้ `WebSearch` / `WebFetch` อัตโนมัติ และบอกในผลลัพธ์ ไม่มีอะไรพัง

#### ใช้ API key แทน (ทางเลือก)

ใส่ใน `~/.zshrc` (หรือ shell profile ที่ใช้เปิด Claude Code) แล้วเปิดเทอร์มินัลใหม่ / รีสตาร์ท Claude Code จากเทอร์มินัลนั้น:

```bash
export PERPLEXITY_API_KEY="pplx-..."   # อย่าใส่ค่าจริงในแชทหรือใน git
```

จากนั้นในเทอร์มินัลใหม่ เพิ่มเซิร์ฟเวอร์แบบมีคีย์แยกจากปลั๊กอิน (อย่าแก้ `.mcp.json` ของปลั๊กอินให้ฝังคีย์):

```bash
claude mcp add --scope user --transport http perplexity-key https://api.perplexity.ai/mcp \
  --header "Authorization: Bearer ${PERPLEXITY_API_KEY}"
```

shell จะแทนค่าคีย์ตอนรันคำสั่ง และ Claude Code เก็บไว้ใน `~/.claude.json` (ไฟล์ส่วนตัวในเครื่อง) ตรวจด้วย `claude mcp list` ว่า `perplexity-key` เป็น Connected ส่วน `plugin:prime-workflow:perplexity` จะยังขึ้น "Needs authentication" ได้ ไม่เป็นไร ห้ามพิมพ์หรือขอคีย์ในแชท

### Context7 (ไม่บังคับ)

ไม่ต้องตั้งอะไร Anonymous ได้ ถ้าต้องการโควตาสูงกว่า: `export CONTEXT7_API_KEY="..."` ใน shell profile เดียวกัน

### งบและ config

ดู `prime.config.json` (ตรวจด้วย `scripts/prime-config-check.mjs` ตาม `prime.config.schema.json`) `maxTurns` ของแต่ละ agent บังคับโดย Claude Code แต่ละขั้นของ gate จำกัดเวลา `reviewGate.stepTimeoutSec` (ค่าเริ่มต้น 1800 วินาที, override ด้วย `PRIME_GATE_TIMEOUT`) แผนตรวจตาม `prime.plan.schema.json` `automation` กำหนดว่าใครอนุมัติแผน (`reviewer` หรือ `user`) และ merge เองหรือถามก่อน (`local` หรือ `ask`) ส่วน `codex` กำหนดโมเดล, reasoning effort และ timeout ของ Codex CLI ความหมาย exit code: [docs/exit-codes.md](docs/exit-codes.md)

### CI สำหรับโปรเจกต์ของคุณ

คัดลอก `scripts/prime-gate.sh` + `scripts/lib/` ไปที่ `<repo>/.github/scripts/` และ `templates/github/prime-gate.yml` ไปที่ `<repo>/.github/workflows/`

### เอกสาร

- `docs/QUICKSTART.md` / `docs/QUICKSTART.en.md` — เริ่มใช้งาน: โหมดอัตโนมัติ และการสั่งเองทีละขั้น
- `docs/workflow-diagram.md` — แผนภาพขั้นตอนทั้งหมด ตั้งแต่วางแผนจนถึงตรวจ base ที่รวมแล้ว และหลักการ SDLC (เกณฑ์ผ่านของแต่ละเฟส)
- `docs/prime-architecture.md` — โครงสร้าง + mermaid + ประวัติจุดอ่อน→แก้
- `docs/exit-codes.md` — exit code ของทุกสคริปต์
- `docs/decisions/` — ADR (0004: integration branch and final review gate)
- `CHANGELOG.md`

### ทดสอบสคริปต์

```bash
bash tests/run.sh     # unit: แต่ละสคริปต์
bash tests/smoke.sh   # e2e: แผน -> worktree -> gate -> review -> queue -> merge -> report -> cleanup แล้วรันขั้นตอนเดียวกันอีกรอบผ่าน harness prime-run.mjs
```

สร้าง git repo ชั่วคราวใน temp แล้วลบเอง ไม่แตะโปรเจกต์อื่น ไม่ใช้เครือข่าย ถ้ามี `shellcheck` จะตรวจด้วย

---

<a id="english"></a>
## English

Prime for Claude Code and Codex: describe a goal in plain words and Prime carries it through with no slash commands. It plans, gives each stream its own git worktree with its own port/env/DB, runs agents in parallel, checks acceptance and lint+typecheck+test, reviews every branch before it merges into your local base, then checks the merged base again. The work follows SDLC phases that each end with an exit criterion. Context7 and Perplexity MCP connect automatically (both optional, with fallbacks).

> `claude-code`, `codex` and `hermes` are **agent roles** in this mod. The `codex` role is the Codex CLI on your machine, with your own login; without the CLI (or the Hermes profile) that role's work goes to `claude-code`.

### Install

```bash
claude plugin marketplace add settanun-prime/prime-studio-mods
claude plugin install prime-workflow@prime-studio-mods
```

Restart Claude Code, run `/prime-doctor` (or `/prime-setup`), then just ask for your goal. Getting started: [docs/QUICKSTART.en.md](docs/QUICKSTART.en.md)

Required: [herdr](https://herdr.dev). Prime runs its agent team on herdr only: every role is a live teammate in its own tab of the hub's workspace. A hub started outside herdr hands the run off to herdr with `scripts/prime-bg.sh`.

Optional: Hermes Agent with Prime's own profile, so Prime's memory stays apart from your other Hermes work: `hermes profile create prime --clone-from default --no-alias`. Without it, `hermes` streams go to `claude-code`.

### Codex CLI (optional)

```bash
npm install -g @openai/codex
codex login
```

With it, the `codex` role is the real Codex CLI running as a teammate in a herdr tab, taking multi-file work and conflict resolution, and the reviewer gets a Codex second opinion (`scripts/prime-codex.sh review`). Without it, `/prime-doctor` warns, `codex` build/fix work goes to `claude-code` (a conflict `resolve` stops for you), and the reviewer reviews alone. Model and effort: `prime.config.json` → `codex`, or `PRIME_CODEX_MODEL` / `PRIME_CODEX_EFFORT`.

### Autopilot

In a git repo, ask for a goal that spans several files or parts and the `prime-workflow` skill starts on its own (or start the session with `claude --agent prime-workflow:prime-orchestrator`). Prime writes the plan, has the reviewer approve it, then loops on the harness `scripts/prime-run.mjs`, which does every mechanical step itself: create worktrees, run acceptance checks, run the gate, merge each stream into the run's integration branch (`prime/<title>-<hash6>`) in plan order, clean up, check it (`verify`), have the reviewer review the whole diff (`final-review`), and only then make one merge into the local base. The thinking steps go to these agents, each a teammate in its own herdr tab, dispatched with `scripts/prime-team.sh` (no subagents):

| Role | Model | Does |
|---|---|---|
| hub (`prime-workflow` skill, `prime-orchestrator`) | Claude Opus 5.5, effort max, in a herdr pane | requirements, research, plan, dispatch |
| `prime-reviewer` | Claude Code (Opus 5.5, effort high) | approves the plan; reviews each branch with a Codex second opinion |
| `claude-code` | Claude Code (Sonnet 5.5, effort high) | focused implementation and fixes |
| `codex` | Codex CLI (`gpt-6.1-sol`, reasoning `xhigh`) | multi-file integration and conflict resolution |
| `hermes` | Hermes Agent, profile `prime` (Prime's own memory) | self-contained streams, a third builder next to Claude Code and Codex |

The base (for example `main`) is untouched until `final-review` approves. If the base moved meanwhile, `codex` merges it into the integration branch (never a rebase). If the reviewer asks for changes, the plan gains a fix stream under a new slug and keeps the merged streams.

Guardrails the harness enforces: a secret scan (`prime-plan.mjs scan`) of the diff and every commit, including `.env*` files (a line with `prime-allow-secret` is skipped; octopus merges fail closed as unscanned; a patch over 64MB fails with exit 2); a stream may only change files under its `paths`; the plan check rejects owned paths that are gitignored or untracked; and a stream can only merge into the integration branch.

Known limitations: the plan's file checks read the main checkout's working tree, not the plan `base` branch, so keep the main checkout's `.gitignore` in line with the base and use trailing slashes for directory paths. `maxParallelWorktrees` also counts merged streams, so a plan at the limit cannot add a fix stream after a final REQUEST_CHANGES: keep plans one stream under it. `integration === target` is not rejected yet. Out of scope: mechanical reviewer-independence enforcement, a maximum diff size beyond the 64MB scan buffer, scanning octopus merges.

In this mode Prime never pushes, opens PRs or deploys. A stream that fails its checks or review 3 times, or a step that makes no progress, stops, and Prime reports why. To be asked before the plan is approved or before each merge, set `automation` in `prime.config.json` (`planApproval: "user"`, `merge: "ask"`). To preview without changing anything: `node scripts/prime-run.mjs` (no `--apply`).

### Prime Principles & Playbooks (v0.8)
High-rigor engineering standards adapted from Cursor `pstack` / `poteto-mode` (see `skills/prime-principles/SKILL.md`):
- **Laziness Protocol (YAGNI & Minimalism)**: Write the minimum code required to solve the immediate problem. Zero speculative abstractions. Reach for the standard library and native platform before dependencies. Subtract before you add.
- **Domain Modeling & Boundary Discipline**: Model the domain with rich types; make invalid states unrepresentable. Strict isolation of side effects within owned stream `paths`.
- **Pre-Coding Blast Radius Mapping**: Map affected modules, callers, shared resources (DB schemas, migrations, ports, env keys), and failure containment before coding. Parallel streams with shared files must enforce `dependsOn`.
- **5 Stream Playbooks**: Structured workflows for every stream: `feature` (Domain model -> contract -> test-first -> minimal implementation), `bug-fix` (Reproduce with failing test first -> root cause isolation -> surgical fix), `refactor` (Strict behavior preservation -> subtract dead code), `perf` (Baseline measurement -> single hypothesis -> benchmark -> delta proof), `investigation` (Read-only exploration -> evidence collection).
- **Scientific Verification ("Prove It Works")**: Runtime evidence over declarations. Acceptance commands must execute real checks against actual behavior and exit 0.
- **Adversarial Interrogation**: Reviewers never rubber-stamp; they challenge edge cases, failure states, concurrent conditions, and blast radius boundaries with a Codex second opinion (`prime-codex.sh review`).
- **Anti-Slop & Comment Discipline**: Zero conversational filler, zero sycophancy. Code is self-documenting; redundant syntax comments are banned.

### op mode: `/setup-op` and `/op-mode`
One entry point that knows what each kind of task needs and which skills to use. Adapted from Cursor's `pstack` (`/setup-pstack`, `/poteto-mode`, MIT) and wired into Prime.
1. `/setup-op` picks a reasoning budget (`unlimited`, `large`, `medium`, `small`) and a model per role (`hub`, `hardest`, `builder`, `reviewer`, `verifier`, `explorer`, `codex`), stored in `~/.claude/op/models.json`.
2. `/op-mode` for any task that needs rigor: it classifies the task, opens the playbook as the task list, loads only the skills that playbook needs (falling back to the bundled prime-principles when a skill is not installed), runs subagents on the role table, hands multi-part work to the Prime autopilot, and proves the result before reporting.

What it adds over pstack:
- Budget and model are separate settings, and `scripts/op-config.mjs` derives effort and validates every value in tested code instead of prompt prose. A bad value is refused with exit 2.
- One table drives both the `/op-mode` subagents and the herdr team (`prime-team.sh`, `prime-bg.sh`). For Codex the order is env, then `/setup-op`, then the plugin config. Until `/setup-op` runs, nothing changes.
- Multi-part work goes through the `prime-run.mjs` harness with enforced gates (acceptance, secret scan, path ownership, reviewer, final review), not a prose-only playbook.
- Decisions go to the run ledger: `prime-ledger.sh decision "<choice>" --why "<evidence>"`, listed by `prime-report.mjs`.
- A structure test checks that every playbook, prime-principles section, script and role `/op-mode` names exists.

### Install in Codex

```bash
codex plugin marketplace add settanun-prime/prime-studio-mods
codex plugin add prime-workflow@prime-studio-mods
```

Codex has no plugin slash commands: ask in plain words, e.g. "do this with Prime". The `prime-workflow` skill runs the same autopilot; for a single step it opens `commands/prime-<step>.md` and runs the same scripts. Run the hub inside a herdr pane and dispatch the team with `scripts/prime-team.sh`, like the Claude hub. The reviewer must stay apart from the context that wrote the code: always a fresh `prime-reviewer` teammate, with `scripts/prime-codex.sh review --base <base>` as its second opinion. `maxTurns` is enforced only in Claude Code. Creating worktrees and merging write outside the workspace, so Codex may ask for approval. Sign in to Perplexity with `codex mcp login perplexity`.

### Commands

Autopilot does not need these, but they still show state or run one step at a time.

| Command | What it does |
|---|---|
| `/prime-setup` | First-time setup (Perplexity sign-in, CI template) |
| `/prime-doctor` | Health check: git, gh, claude, node, Codex CLI, MCP, key presence, config, plan, ledger, with `fix:` hints |
| `/prime-plan` | Checkpoint: write/check/accept `.prime/plan.json` (streams, file ownership, dependencies, acceptance), then create worktrees in order |
| `/prime-worktree <slug>` | Create an isolated worktree |
| `/prime-status` | Every branch: ahead/behind, gate/review, overlapping files |
| `/prime-queue` | Merge order: plan dependencies, readiness, conflicts predicted with `git merge-tree`, size (read-only) |
| `/prime-review` | Run the gate + reviewer and record the verdict |
| `/prime-merge` | Dry-run by default; `--apply` merges into the local base (refuses while a plan dependency is unmerged or the secret scan finds something; a plan stream can only merge into the integration branch); `--no-rebase` exits 4 instead of rebasing when the base moved; `--apply --pr` opens a draft PR |
| `/prime-cleanup` | Remove merged worktrees (dry-run by default) |
| `/prime-report` | Ledger summary: gates/reviews/merges and turns each agent used vs its `maxTurns` budget |

### Ledger

Every script appends events to `<git common dir>/prime/runs.jsonl` (local only, never committed or uploaded). `scripts/prime-team.sh` records each teammate run itself (add one by hand with `scripts/prime-ledger.sh agent <role> --turns N`). Turn it off with `PRIME_LEDGER=0`.

### Perplexity (optional)

The mod connects to `https://api.perplexity.ai/mcp` with sign-in (OAuth), Perplexity's [documented Claude Code setup](https://docs.perplexity.ai/docs/getting-started/integrations/mcp-server) (checked 2026-10-08):

1. In Claude Code run `/mcp`
2. Choose `plugin:prime-workflow:perplexity` and sign in
3. You must be an admin of a Perplexity API organization that can pay for usage

Until you sign in, the hub falls back to `WebSearch` / `WebFetch` and says so. Nothing breaks.

#### Using an API key instead (optional)

Put this in `~/.zshrc` (or whichever shell profile launches Claude Code), then open a new terminal and restart Claude Code from it:

```bash
export PERPLEXITY_API_KEY="pplx-..."   # never paste a real key into chat or git
```

Then, in that new terminal, add a separate key-based server (do not put a key into the plugin's `.mcp.json`):

```bash
claude mcp add --scope user --transport http perplexity-key https://api.perplexity.ai/mcp \
  --header "Authorization: Bearer ${PERPLEXITY_API_KEY}"
```

Your shell substitutes the key when you run this, and Claude Code stores it in `~/.claude.json` (private, on your machine). Check `claude mcp list`: `perplexity-key` should be Connected; `plugin:prime-workflow:perplexity` may still say "Needs authentication", which is fine. Never type or ask for a key in chat.

### Context7 (optional)

Nothing required (anonymous works). For higher limits: `export CONTEXT7_API_KEY="..."` in the same shell profile.

### Budgets and config

See `prime.config.json` (validated by `scripts/prime-config-check.mjs` against `prime.config.schema.json`). Each agent's `maxTurns` is enforced by Claude Code. Each gate step is limited by `reviewGate.stepTimeoutSec` (default 1800 s, override with `PRIME_GATE_TIMEOUT`). Plans are validated against `prime.plan.schema.json`. `automation` sets who approves the plan (`reviewer` or `user`) and whether merges happen on their own or ask first (`local` or `ask`); `codex` sets the Codex CLI model, reasoning effort and timeout. Exit codes: [docs/exit-codes.md](docs/exit-codes.md)

### CI for your own projects

Copy `scripts/prime-gate.sh` + `scripts/lib/` into `<repo>/.github/scripts/` and `templates/github/prime-gate.yml` into `<repo>/.github/workflows/`.

### Docs

- `docs/QUICKSTART.en.md` / `docs/QUICKSTART.md` — getting started: autopilot, then the manual steps
- `docs/workflow-diagram.md` — the whole workflow as one diagram, plan to the verified base, and the SDLC phases with their exit criteria
- `docs/prime-architecture.md` — structure, mermaid, weakness→fix history
- `docs/exit-codes.md` — exit codes of every script
- `docs/decisions/` — ADRs (0004: integration branch and final review gate)
- `CHANGELOG.md`

### Testing the scripts

```bash
bash tests/run.sh     # unit: each script
bash tests/smoke.sh   # e2e: plan -> worktrees -> gate -> review -> queue -> merge -> report -> cleanup, then the same flow through the prime-run.mjs harness
```

Builds throwaway git repos in a temp directory and deletes them. No network, does not touch other projects. Runs `shellcheck` when it is installed.
