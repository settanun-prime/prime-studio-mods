# บันทึกการเปลี่ยนแปลง / Changelog

รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) โดยจัดหัวข้อตามเวอร์ชันของแต่ละมอดในชุด Prime Studio Mods ซึ่งใช้ [Semantic Versioning](https://semver.org/)  
Based on Keep a Changelog; each mod in Prime Studio Mods is versioned independently with SemVer.

---

## [1.0.0] - 2026-10-16

### prime-guard 1.0.0
- **ความสามารถหลัก / Core Features**:
  - **PDPA & Privacy Protection**: ระบบตรวจจับและปกปิดข้อมูลส่วนบุคคลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 และสากล (เลขบัตรประจำตัวประชาชน, เบอร์โทรศัพท์, อีเมล, เลขบัตรชำระเงินตามสูตร Luhn, IPv4, หนังสือเดินทาง, เลขบัญชีธนาคาร, วันเกิด, ที่อยู่, ชื่อ-นามสกุล, และหมวดข้อมูลอ่อนไหวตามมาตรา 26)
  - **Secret & Credential Protection**: ป้องกันไฟล์สำคัญ (`.env*`, SSH keys, private keys, API tokens) ไม่ให้ถูกอ่านผ่านเครื่องมือหรือส่งออกภายนอก
  - **Machine Identity Masking**: ปิดบังข้อมูลระบุตัวตนของเครื่อง (ชื่อผู้ใช้, hostname, profile paths, LAN URLs, MAC addresses, SIDs) บนจอภาพโดยอัตโนมัติ
  - **Publish Scan & Tool Guard**: ตรวจสอบ commit ก่อน `git push`, `gh release` หรือ package publish ปฏิเสธการส่งออกหากพบ secret หรือข้อมูลส่วนบุคคล
- **คำสั่ง / Commands**:
  - `/prime-guard` (`redact` | `block` | `off`) — ปรับโหมดการทำงานของตัวป้องกัน (aliases: `/guard`, `/pdpa-guard`)
  - `/prime-blur` (`on` | `off` | `record`) — ควบคุมการพรางข้อความบนจอภาพ รองรับโหมดบันทึกวิดีโอ/แชร์หน้าจอ (aliases: `/blur`, `/pdpa-blur`)

### prime-ctbar 1.0.0
- **ความสามารถหลัก / Core Features**:
  - แถบแสดงสถานะ Context window breakdown แบบเรียลไทม์เหนือช่องพรอมต์
  - ตัวนับเวลาถอยหลัง Prompt Cache (`live` / นับถอยหลัง / `cold`)
  - ปุ่ม Compact แบบโต้ตอบคลิกได้ทันทีเมื่อบริบทใกล้เต็ม
- **คำสั่ง / Commands**:
  - `/prime-ctbar` — สลับเปิด/ปิดแถบสถานะ (alias: `/ctbar`)

### prime-workflow 1.0.0
- **ความสามารถหลัก / Core Features**:
  - ระบบ Autopilot บริหารจัดการงานพัฒนาโค้ดแบบครบวงจรตั้งแต่รับเป้าหมาย วางแผน แยกงานลง Git Worktree คู่ขนาน ตรวจสอบ รีวิว และ merge อัตโนมัติ โดยไม่ต้องพึ่งพาคำสั่ง slash
  - **Prime Principles & Playbooks (pstack/poteto-mode rigor)**: ยกระดับระเบียบวิศวกรรมขั้นสูงตามแนวทาง `pstack` ได้แก่ Laziness Protocol (YAGNI, minimal code, stdlib first), Domain Modeling, Pre-Coding Blast Radius Mapping, 5 Stream Playbooks (`feature`, `bug-fix`, `refactor`, `perf`, `investigation`), Prove It Works (runtime evidence), Adversarial Interrogation (รีวิวเชิงซักค้าน), และ Anti-Slop / No-Comment hygiene
  - **Herdr Agent Team**: ขับเคลื่อนทีมเอเจนต์พร้อมกันในหลายแท็บแยกตามบทบาท (Claude Code, Codex CLI, Hermes Agent)
  - **Adversarial Reviewer Gate & Verification**: ประเมินผลงานอิสระด้วย `prime-reviewer` ตรวจสอบหลักฐานการรันจริง ขอบเขต blast radius และขอความเห็นที่สองจาก Codex ก่อน merge เข้า branch หลัก
  - **Integration Branch Isolation**: แยกการทำงานใน `prime/<task>-<hash6>` ปลอดภัยต่อ branch หลัก และสแกนหาสิ่งแปลกปลอม/secret ก่อนอนุมัติ
  - รองรับ Context7 และ Perplexity MCP (พร้อม fallback เป็น WebSearch/WebFetch อัตโนมัติ)
- **คำสั่ง / Commands**:
  - คำสั่งตระกูล `/prime-*` (`/prime-plan`, `/prime-status`, `/prime-doctor`, `/prime-review`, `/prime-merge`, `/prime-cleanup`)
  - รายละเอียดทางสถาปัตยกรรมและการทำงานดูได้ที่ [prime-workflow/docs/prime-architecture.md](prime-workflow/docs/prime-architecture.md) และหลักการวิศวกรรมที่ [prime-workflow/skills/prime-principles/SKILL.md](prime-workflow/skills/prime-principles/SKILL.md)

### prime-agents-panel 1.0.0
- **ความสามารถหลัก / Core Features**:
  - แผงควบคุมด้านข้าง (Side pane) แสดงรายชื่อเอเจนต์ทั้งหมด ทั้งของโปรเจกต์ (`.claude/agents`), ผู้ใช้ และปลั๊กอิน
  - ปุ่มกดเรียกใช้งานเอเจนต์ย่อย (Subagent) ได้ในคลิกเดียว พร้อมชุดการทดสอบครอบคลุมแบบอัตโนมัติ
- **คำสั่ง / Commands**:
  - `/prime-agents-panel` — สลับเปิด/ปิดแผงควบคุมเอเจนต์

---

## การติดตั้งและการใช้งาน / Installation

ติดตั้งผ่าน Claude Code Marketplace:
```bash
claude plugin marketplace add settanun-prime/prime-studio-mods
claude plugin install prime-guard@prime-studio-mods
claude plugin install prime-ctbar@prime-studio-mods
claude plugin install prime-agents-panel@prime-studio-mods
claude plugin install prime-workflow@prime-studio-mods
```

และสำหรับ Codex CLI:
```bash
codex plugin marketplace add settanun-prime/prime-studio-mods
codex plugin add prime-workflow@prime-studio-mods
```
