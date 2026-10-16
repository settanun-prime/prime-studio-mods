# Prime Quickstart (ภาษาไทย)

[English](QUICKSTART.en.md)

ตั้งแต่ v0.5 Prime ทำงานเองอัตโนมัติ ติดตั้งแล้วบอกสิ่งที่อยากได้เป็นภาษาธรรมดาได้เลย ส่วน A คือเส้นทางอัตโนมัติ ส่วน B คือการสั่งเองทีละขั้นด้วยคำสั่ง `/prime-*` ซึ่งยังใช้ได้เหมือนเดิม

# A. โหมดอัตโนมัติ

## 1. ติดตั้งและตรวจ

```bash
claude plugin marketplace add settanun-prime/prime-studio-mods
claude plugin install prime-workflow@prime-studio-mods
```

รีสตาร์ท Claude Code แล้วใน repo ของคุณพิมพ์ `/prime-doctor` ทุกบรรทัด WARN/FAIL จะมี `fix:` บอกวิธีแก้ ต้องมี git 2.39+, node และ [herdr](https://herdr.dev) เพราะ Prime รันทีม agent บน herdr เท่านั้น (ถ้าเริ่ม hub นอก herdr มันจะส่งต่อไปรันใน herdr ด้วย `scripts/prime-bg.sh`)

Hermes Agent ไม่บังคับ: สร้าง profile ของ Prime แยกไว้ด้วย `hermes profile create prime --clone-from default --no-alias` ถ้าไม่มี stream ของ `hermes` จะย้ายไปให้ `claude-code` ทำแทน

Codex CLI ไม่บังคับ ถ้าติดตั้งไว้ role `codex` จะส่งงานที่แตะหลายไฟล์ให้ Codex ทำ และ reviewer จะได้ความเห็นที่สองจาก Codex ด้วย:

```bash
npm install -g @openai/codex
codex login
```

ถ้าไม่มี `/prime-doctor` จะเตือน stream ของ role `codex` จะย้ายไปให้ `claude-code` ทำแทน และ reviewer จะรีวิวคนเดียว ตั้งโมเดลและ effort ได้ที่ `prime.config.json` → `codex` (`gpt-6.1-sol`, reasoning `xhigh`) หรือใช้ `PRIME_CODEX_MODEL` / `PRIME_CODEX_EFFORT`

Perplexity ไม่บังคับ: `/mcp` -> `plugin:prime-workflow:perplexity` -> sign in ถ้าไม่ทำ hub จะใช้ WebSearch แทน

## 2. บอกเป้าหมาย

ใน git repo พิมพ์เป้าหมายเป็นภาษาธรรมดา เช่น

```text
เพิ่มการจ่ายเงินด้วยบัตร: มี API สร้าง order และหน้า checkout พร้อม test ยังไม่ต้องทำคูปอง
```

ไม่ต้องพิมพ์ slash command เพราะ skill `prime-workflow` จะเริ่มเองเมื่องานแตะหลายไฟล์หรือหลายส่วน (ไม่เริ่มกับคำถามหรือการแก้บรรทัดเดียว) ถ้าอยากให้ทั้ง session เป็นอัตโนมัติ ให้เปิด Claude Code ด้วย `claude --agent prime-workflow:prime-orchestrator` หรือจะพิมพ์ว่า "use Prime" ก็ได้

## 3. ระบบทำอะไรบ้าง

1. **วางแผน** Prime ซึ่งเป็น hub (Claude Opus) เขียน `.prime/plan.json` (ไม่เข้า git) ระบุ stream, path ที่แต่ละ stream ดูแล, `dependsOn` และคำสั่ง acceptance ที่จะ fail จนกว่างานจะเสร็จ ดูตัวอย่างด้านล่าง
2. **อนุมัติแผน** `prime-reviewer` (Claude Opus) ตรวจแผนแล้วอนุมัติ หรือส่งกลับให้ hub พร้อมรายการที่ต้องแก้
3. **สร้างงาน** harness (`scripts/prime-run.mjs`) สร้าง worktree ให้ stream ละหนึ่งอันตามลำดับ dependency แล้ว `claude-code` (Claude Code บน Sonnet), `codex` (Codex CLI) หรือ `hermes` (Hermes Agent, profile `prime`) ทำงานของ stream นั้นและ commit คนทำงานแต่ละตัวเป็น teammate ในแท็บ herdr ของตัวเอง และใช้แท็บเดิมตอน `fix` ของ stream นั้น
4. **ตรวจ** harness รัน acceptance ของ stream และ gate (lint/typecheck/test) บน commit นั้นตรง ๆ ถ้าไม่ผ่านจะส่งกลับให้คนทำแก้ (`fix`)
5. **รีวิว** `prime-reviewer` รีวิว branch โดยมีความเห็นที่สองจาก Codex ถ้า APPROVE harness จะ merge เข้า **integration branch** ของรอบงาน (`prime/<ชื่อ>-<hash6>`) ทีละ stream ตามลำดับในแผน (base ของคุณยังไม่ถูกแตะ) การตรวจรวมถึง secret scan และ "แก้เฉพาะไฟล์ใน path ของ stream" ถ้าชนกัน `codex` จะแก้ แล้ว branch นั้นต้องผ่านการตรวจและรีวิวใหม่
6. **ยืนยันผล** หลัง stream สุดท้าย harness ลบ worktree ของ stream เปิด worktree สุดท้ายบน integration branch แล้วรัน acceptance ทุกข้อ gate และตรวจ path บน head ของ integration branch (ใน main checkout ถ้าอยู่บน branch นั้น ไม่งั้นใน worktree ชั่วคราว)
7. **รีวิวขั้นสุดท้าย** `prime-reviewer` (พร้อมความเห็นที่สองจาก Codex) รีวิว diff base...integration ทั้งก้อน (`final-review`) ถ้า APPROVE harness จะ merge เข้า base **ในเครื่อง** ครั้งเดียว (`--no-rebase` ถ้า base ขยับ `codex` จะ merge base เข้า integration branch ก่อน ไม่ rebase) ถ้า REQUEST_CHANGES แผนจะเพิ่ม fix stream ใต้ slug ใหม่ และ stream ที่ merge แล้วยังอยู่ในแผน จากนั้น Prime รายงานผลแต่ละ stream ผลการยืนยัน commit ของ base ในเครื่อง และ turn ที่ใช้เทียบงบ

ระบบไม่ push อะไรเลย การ push เปิด PR และ deploy เป็นการตัดสินใจของคุณ ถ้า stream ไหนไม่ผ่านการตรวจหรือรีวิวครบ 3 ครั้ง หรือขั้นไหนไม่คืบหน้า stream นั้นจะหยุด Prime จะบอกว่าหยุดที่ stream ไหนเพราะอะไร แล้วทำ stream อื่นต่อ

ตัวอย่างแผน:

```json
{
  "version": 1,
  "title": "ระบบ checkout",
  "status": "draft",
  "goal": "ผู้ใช้จ่ายเงินด้วยบัตรได้",
  "nonGoals": ["คูปอง"],
  "base": "main",
  "streams": [
    { "slug": "checkout-api", "role": "claude-code", "summary": "API สร้าง order",
      "paths": ["src/api/checkout/"], "dependsOn": [],
      "acceptance": ["npm test -- src/api/checkout"] },
    { "slug": "checkout-ui", "role": "claude-code", "summary": "หน้า checkout",
      "paths": ["src/app/checkout/"], "dependsOn": ["checkout-api"],
      "acceptance": ["npm test -- src/app/checkout"] }
  ],
  "risks": ["เปลี่ยน schema ของ order"]
}
```

`acceptance` แต่ละข้อคือคำสั่ง shell ที่รันจาก root ของ worktree ถ้า exit 0 ถือว่าผ่าน

## 4. เปิด checkpoint

ค่าเริ่มต้นคือระบบไม่หยุดรอคุณเลยตั้งแต่สั่งงานจนถึงรายงานสุดท้าย ถ้าอยากให้หยุดถามเหมือนเดิม ให้ตั้ง `automation` ใน `prime.config.json` ของปลั๊กอิน (เป็นไฟล์ของปลั๊กอินเอง หลังอัปเดตปลั๊กอินควรเช็กอีกครั้ง):

```json
"automation": { "planApproval": "user", "merge": "ask" }
```

- `planApproval: "user"`: Prime แสดงแผนแล้วรอคุณตอบ OK ก่อนสร้าง worktree
- `merge: "ask"`: Prime ถามก่อน merge เข้า base ในเครื่องทุกครั้ง

เลือกเปิดอย่างใดอย่างหนึ่งหรือทั้งสองอย่างก็ได้

## 5. ดูความคืบหน้าหรือดูล่วงหน้า

- `/prime-status`: ดู worktree ทั้งหมด ahead/behind สถานะ gate และ review
- `/prime-report`: gate, review, merge และ turn ที่ใช้ต่อ agent เทียบงบ
- ถ้าอยากรู้ว่าขั้นต่อไปจะทำอะไรโดยไม่เปลี่ยนอะไรเลย ให้ Claude รัน `node ${CLAUDE_PLUGIN_ROOT}/scripts/prime-run.mjs` (ไม่ใส่ `--apply`) ส่วน `prime-run.mjs verify` จะรัน acceptance ทุกข้อและ gate บน base ตอนนี้

# B. สั่งเองทีละขั้น

คำสั่ง `/prime-*` ยังใช้สั่งแต่ละขั้นเองได้ ทุกขั้นที่เปลี่ยนอะไรจริงเป็น dry-run ก่อนเสมอ

## 1. วางแผน (checkpoint)

```text
/prime-plan init "ระบบ checkout"
```

Prime (hub) เขียนแผนลง `.prime/plan.json` แบบเดียวกับตัวอย่างในข้อ A.3

`/prime-plan check` ตรวจ: schema, จำนวน stream ไม่เกินงบ, acceptance อย่างน้อย `minAcceptanceChecks` ข้อต่อ stream (ค่าเริ่มต้น 1), path ต้องเป็น relative, dependsOn ต้องมีจริงและไม่วนกัน, **สอง stream ห้ามเป็นเจ้าของ path เดียวกัน** เว้นแต่ stream หนึ่ง dependsOn อีก stream

ดูแผนแล้วตอบ OK จากนั้น Prime รัน `accept` และ `apply --apply` ซึ่งสร้าง worktree ตามลำดับ dependency พร้อม `.prime/ownership.json` ถ้าแก้แผนหลัง accept ต้อง `check` + `accept` ใหม่ (apply จะปฏิเสธ exit 3)

## 2. ทำงานคู่ขนาน

- `claude-code`, `codex` หรือ `hermes` ทำงานใน worktree ของตัวเอง (port, `.env.worktree`, DB branch `wt-<slug>` แยกกัน) เป็น teammate ในแท็บ herdr ของตัวเอง
- `prime-team.sh` บันทึกการรันของ teammate แต่ละตัวลง ledger เอง
- `/prime-status` ดูภาพรวม

## 3. ลำดับการ merge

```text
/prime-queue
```

เรียงตาม dependency ของแผน -> พร้อมแล้ว (gate + review ตรงกับ commit ปัจจุบัน) -> คาดว่าชนกับ base -> ชนกันเอง -> ขนาด ทำนายการชนด้วย `git merge-tree` โดยไม่แตะ checkout ไหนเลย บรรทัด `next:` คือสาขาที่ควร merge ก่อน

## 4. รีวิวและ merge

```text
/prime-review checkout-api
/prime-merge checkout-api            # dry-run
/prime-merge checkout-api --apply    # rebase -> gate -> ตรวจ fingerprint -> merge เข้า base ในเครื่อง
```

- exit 3: ถูกปฏิเสธ (ยังไม่ APPROVE, tree ไม่สะอาด, dependency ในแผนยังไม่ merge, secret scan พบ, stream ของแผนชี้ไป base อื่นที่ไม่ใช่ integration branch)
- exit 4: ชนตอน rebase หรือ base ขยับเมื่อใช้ `--no-rebase` -> ส่งให้ `codex` แล้วรีวิวใหม่
- exit 5: โค้ดเปลี่ยนหลังรีวิว -> รีวิวใหม่

ไม่ push base และไม่ force-push ถ้าต้องการ PR: `--apply --pr` (draft)

## 5. สรุปและเก็บกวาด

```text
/prime-report     # gate/review/merge และ turn ที่ใช้ต่อ agent เทียบงบ
/prime-cleanup    # dry-run; --apply ลบ worktree ที่ merge แล้ว
```

ความหมาย exit code ทั้งหมด: [exit-codes.md](exit-codes.md)
