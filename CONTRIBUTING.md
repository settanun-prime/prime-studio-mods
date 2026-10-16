# การร่วมพัฒนา / Contributing

**ไทย** · [English](#en)

<a id="th"></a>

## ภาษาไทย

ยินดีต้อนรับสู่การร่วมพัฒนา **Prime Studio Mods**! เพื่อให้โครงการมีคุณภาพ เรียบง่าย และปลอดภัยสำหรับทุกคน โปรดปฏิบัติตามแนวทางด้านล่างนี้:

### กฎสำคัญ: ห้ามใช้ข้อมูลส่วนบุคคลหรือ Secret จริง

เนื่องจาก `prime-guard` เป็นมอดที่ใช้สำหรับตรวจจับข้อมูลส่วนบุคคลและความลับ โครงการนี้จึงต้องไม่มีข้อมูลส่วนบุคคลจริงหรือ Secret จริงเด็ดขาด:

- **ใช้ข้อมูลสมมติเท่านั้น**: ค่าตัวอย่างในชุดทดสอบ เอกสาร หรือภาพหน้าจอ ต้องเป็นค่าสมมติทั้งหมด
- **ห้ามส่งข้อมูลจริงใน Issue หรือ PR**: หากต้องการรายงานปัญหา ให้จำลองรูปแบบด้วยข้อมูลตัวอย่าง

### การเตรียมเครื่องและการทดสอบ (Development & Testing)

ติดตั้งและทดสอบมอดด้วย Claude Code CLI:

```bash
git clone https://github.com/settanun-prime/prime-studio-mods.git
cd prime-studio-mods

# 1. ตรวจสอบ manifest ของ marketplace และมอด
claude plugin validate .
claude plugin validate prime-guard
claude plugin validate prime-ctbar
claude plugin validate prime-agents-panel
claude plugin validate prime-workflow

# 2. รันชุดทดสอบ
claude plugin test prime-guard
claude plugin test prime-ctbar

# 3. ทดสอบการทำงานสดเฉพาะเซสชันนี้
claude --plugin-dir ./prime-guard
```

### การส่ง Pull Request

1. สำหรับการแก้ไขเล็กน้อย (แก้คำผิด บั๊กชัดเจน ปรับปรุงเอกสาร) สามารถเปิด PR ได้ทันที
2. สำหรับการเพิ่มฟีเจอร์หรือชนิดข้อมูลใหม่ใน `prime-guard` แนะนำให้เปิด issue ปรึกษารูปแบบก่อน
3. ตรวจสอบว่าคำสั่ง `validate` และ `test` ผ่านเรียบร้อยก่อนส่ง PR
4. อัปเดตเอกสารที่เกี่ยวข้องและเพิ่มบันทึกใน [`CHANGELOG.md`](CHANGELOG.md)

### สัญญาอนุญาต

โค้ดทั้งหมดในโครงการนี้เผยแพร่ภายใต้สัญญาอนุญาต [MIT License](LICENSE)

---

<a id="en"></a>

## English

Welcome to **Prime Studio Mods**! To keep our codebase clean, minimal, and secure, please follow these guidelines:

### Critical Rule: No Real Personal Data or Secrets

Because `prime-guard` inspects PII and secrets, real credentials and personal data must never be committed to this repository:

- **Use fictional/fake values**: All samples in tests, docs, and screenshots must be mock values.
- **Never paste real secrets in issues or PRs**: Simulate formats using sanitized sample data.

### Development & Testing Setup

Develop and test mods using the Claude Code CLI:

```bash
git clone https://github.com/settanun-prime/prime-studio-mods.git
cd prime-studio-mods

# 1. Validate manifests
claude plugin validate .
claude plugin validate prime-guard
claude plugin validate prime-ctbar
claude plugin validate prime-agents-panel
claude plugin validate prime-workflow

# 2. Run unit tests
claude plugin test prime-guard
claude plugin test prime-ctbar

# 3. Test a mod locally in current session
claude --plugin-dir ./prime-guard
```

### Pull Requests

1. For small bug fixes, typo fixes, or documentation enhancements, feel free to open a PR directly.
2. For new detectors or architectural changes, please open an issue first to align on the format.
3. Ensure both `claude plugin validate` and `claude plugin test` pass locally before submitting.
4. Update corresponding documentation and add an entry to [`CHANGELOG.md`](CHANGELOG.md).

### License

All contributions to this repository are licensed under the [MIT License](LICENSE).
