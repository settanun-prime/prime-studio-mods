# บันทึกการเปลี่ยนแปลง / Changelog

รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) โดยจัดหัวข้อตามเวอร์ชันของแต่ละมอดในชุด Prime Studio Mods ซึ่งใช้ [Semantic Versioning](https://semver.org/)  
Based on Keep a Changelog; each mod in Prime Studio Mods is versioned independently with SemVer.

---

## [1.1.0] - 2026-10-16

### prime-ctbar 1.1.0
- **ใหม่ / New**: กดปุ่ม compact แล้วแถบ context สั่น แตก และสลายเป็นฝุ่น ระหว่าง compact ฝุ่นหมุนรอ แล้วแถบประกอบกลับเมื่อเสร็จ / pressing compact shakes the bar, cracks it and crumbles it to dust, then builds it back when the compaction answers
- **ใหม่ / New**: เสียง 8-bit เมื่อรันเทสผ่าน และเสียงเตือนเมื่อเทสล้มเหลวหรือ turn จบด้วย error; `/prime-ctbar sound on|off` / 8-bit jingle when a test run passes, buzz when it fails or a turn errors
- **แก้ / Fixed**: `/ctbar` และ `/context-bar` ใช้งานได้จริง (เดิมไม่ได้ลงทะเบียน) / the aliases are registered now
- **แก้ / Fixed**: hot reload ระหว่างแอนิเมชันไม่ทำให้ปุ่มค้างอีก / a reload mid-animation no longer leaves the button dead
- **แก้ / Fixed**: compact ที่เกิน 2 นาทีไม่สั่ง `/compact` ซ้อน; error ครั้งเดียวไม่ทำให้ทุกครั้งต่อไปไปทาง `/compact`; ยกเลิก timer ที่ค้าง / a timed-out compaction no longer starts a second one, one failure no longer switches every later press to `/compact`, the timeout timer is cancelled
- **แก้ / Fixed**: พิมพ์ slash command ไม่ทำให้ cache ค้างที่ `live` / a slash command no longer leaves the cache shown as `live`
- **แก้ / Fixed**: argument ที่ไม่รู้จักแสดงวิธีใช้แทนการซ่อนแถบ / an unknown argument shows usage instead of toggling the bar

### prime-guard 1.1.0
- **ใหม่ / New**: เสียง 8-bit เมื่อรันเทสผ่าน และเสียงเตือนเมื่อเทสล้มเหลว turn error หรือ guard ปฏิเสธการเรียกเครื่องมือ; `/prime-guard sound on|off`
- **แก้ / Fixed**: blur พรางเฉพาะค่าที่ตรวจพบ ไม่ใช่ทั้งบรรทัด และ hover เปิดดูได้จริง (ยกเว้นโหมด record) / only the detected value is masked, and hover reveals it outside recording mode
- **แก้ / Fixed**: `git push` ไม่ถูกปฏิเสธเพราะชื่อและอีเมลผู้ commit ของตัวเอง และ branch ใหม่สแกนเฉพาะ commit ที่ยังไม่มีบน remote / a push is no longer refused for the pusher's own author line; a new branch scans only commits no remote has
- **แก้ / Fixed**: `PRIME_GUARD_NAMES` / `PRIME_GUARD_KEEP` ตามที่ `/prime-guard names` บอกใช้งานได้ (ชื่อเดิม `PDPA_GUARD_*` ยังใช้ได้)
- **แก้ / Fixed**: `/guard`, `/pdpa-guard`, `/blur`, `/pdpa-blur` ลงทะเบียนแล้ว
- **แก้ / Fixed**: slash command ที่มีข้อมูลส่วนบุคคลใน argument ไม่ขึ้นข้อความว่าปกปิดแล้วอีก (engine ไม่รับการแก้ข้อความของ command) แต่เตือนแทน / no false "redacted" toast for slash-command arguments; a warning instead
- **แก้ / Fixed**: prompt.submit และ tool.call ปิดกั้นไว้ก่อนเมื่อ hook หมดเวลา (`.catch`) / both fail closed on a hook timeout

### prime-agents-panel 1.0.1
- **แก้ / Fixed**: ไฟล์ agent ที่อ่านไม่ได้หรือขึ้นต้นด้วย BOM ไม่ทำให้ pane ว่างหรือชื่อผิด / an unreadable or BOM-led agent file no longer empties the pane or loses its name

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
