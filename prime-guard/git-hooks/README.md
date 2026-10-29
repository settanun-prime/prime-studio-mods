# prime-guard git hooks

กันข้อมูลส่วนตัวและข้อมูลเครือข่ายของเครื่องนี้ไม่ให้หลุดขึ้น GitHub ทุก repo บนเครื่อง ทั้งใน Claude Code และนอก Claude Code
แอปแสดงข้อมูลจริงตอนรันได้ แต่สิ่งที่เข้า git ต้องสะอาด

## เปิด / ปิด

- เปิด: `/prime-guard git on` (ตั้ง `git config --global core.hooksPath` มาที่โฟลเดอร์นี้)
- ปิด: `/prime-guard git off` หรือ `git config --global --unset core.hooksPath`
- ดูสถานะ: `/prime-guard git status`
- ข้ามครั้งเดียว (ฉุกเฉิน): ใส่ `--no-verify` ตอน push
- `on` ไม่เขียนทับ `core.hooksPath` ของเครื่องมืออื่น (เช่น Husky) และ `off` ลบเฉพาะของ prime-guard
- อัปเดตปลั๊กอินแล้ว เปิด session ถัดไป path จะย้ายไปโฟลเดอร์เวอร์ชันใหม่เอง

## ทำงานอย่างไร

- `pre-push` สแกนทุก commit ที่กำลัง push (patch + ข้อความ commit) ถ้าเป็น branch ใหม่สแกนทุก commit ที่ยังไม่อยู่บน remote ใด เจอ = **บล็อก**
- `pre-commit` สแกน diff ที่ stage ไว้ **เตือนอย่างเดียว** ไม่บล็อก (ข้ามการอ่าน IP/MAC ของ LAN เพื่อให้เร็ว)
- รายงานแค่ ไฟล์:บรรทัด + ชนิด + ค่าที่ปิดบัง (`19***(12 chars)`) ไม่พิมพ์ค่าจริง
- ข้ามไฟล์ binary; hook เดิมใน `.git/hooks/pre-push` และ `pre-commit` ของแต่ละ repo ยังถูกเรียกต่อ
- e-mail จริงของ author/committer: เตือน ไม่บล็อก
- repo ที่ตั้ง `core.hooksPath` ของตัวเอง (local) ไม่ผ่าน guard นี้

## ตรวจอะไร

1. รูปแบบที่ไม่มีทางเป็น placeholder: private key, token (AWS, GitHub, Slack, Google, OpenAI/Anthropic, Stripe, Telegram bot, Tailscale auth key), IP Tailscale นอกช่วง placeholder (`100.64.0.x` และ IPv6 แบบสั้น), MAC ฮาร์ดแวร์จริง (MAC ทดสอบให้ใช้ bit local เช่น `02-..`), path โปรไฟล์ Windows, Windows SID
2. ค่าจริงของเครื่องนี้ อ่านตอน push: IP LAN ของเครื่องและเพื่อนบ้านใน ARP (ยกเว้น router), MAC ของ adapter และ ARP, host ใน `~/.ssh/config`, IP/ชื่อ node/login ของ Tailscale, ชื่อ tailnet, ชื่อผู้ใช้ Windows (ทั้งคำ), e-mail จริงทุกอัน (ยกเว้น `@users.noreply.github.com`, `noreply@`, `git@`, โดเมน example/test/local)

## ยกเว้นค่าที่ตั้งใจใส่

- ต่อ repo: ไฟล์ `.guard-allow` ที่ root ของ repo, 1 regex ต่อบรรทัด เทียบกับค่าที่เจอ (บรรทัดที่ขึ้นต้น `#` เป็นหมายเหตุ)
- ทั้งเครื่อง: `~/.git-guard-allow` รูปแบบเดียวกัน (อยู่นอกปลั๊กอิน อัปเดตแล้วไม่หาย)

## ทดสอบ / รายงาน

- ทดสอบ: `sh git-hooks/test-guard.sh` (repo ทิ้งชั่วคราว + remote ในเครื่อง ไม่มีอะไรออกนอกเครื่อง)
- รายงานอย่างเดียว: `python git-hooks/guard.py report <repo>...` (แสดงแค่ชนิดและจำนวนใน commit ที่ยังไม่ push)

ต้องมี `sh` (Git for Windows), Python 3 และ PowerShell 5.1 บน Windows ไม่มี dependency เพิ่ม ถ้าหา Python ไม่เจอ push จะถูกบล็อก
