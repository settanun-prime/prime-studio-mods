# นโยบายความปลอดภัย / Security Policy

**ไทย** · [English](#en)

<a id="th"></a>

## ภาษาไทย

### เวอร์ชันที่ได้รับการดูแล (Supported Versions)

การแก้ไขด้านความปลอดภัยจะออกในเวอร์ชันล่าสุดของแต่ละมอดในชุด Prime Studio Mods:

| มอด | เวอร์ชันที่ดูแล |
| --- | --- |
| `prime-guard` | 1.0.x |
| `prime-ctbar` | 1.0.x |
| `prime-agents-panel` | 1.0.x |
| `prime-workflow` | 1.0.x |

วิธีอัปเดตเป็นเวอร์ชันล่าสุด:
```bash
claude plugin marketplace update prime-studio-mods
claude plugin update <ชื่อมอด>@prime-studio-mods
```

### การรายงานช่องโหว่ความปลอดภัย

**กรุณาอย่าเปิด issue สาธารณะสำหรับรายงานช่องโหว่ความปลอดภัย**

1. รายงานผ่าน [GitHub Private Security Advisory](https://github.com/settanun-prime/prime-studio-mods/security/advisories/new)
2. หรือติดต่อผู้ดูแลโครงการผ่าน GitHub: [@settanun-prime](https://github.com/settanun-prime)

**แนวทางปฏิบัติในการรายงาน:**
- **ห้ามใส่ข้อมูลส่วนบุคคลจริงหรือ Secret จริง**: ให้ใช้ข้อมูลสมมติที่จำลองรูปแบบเดียวกันเสมอ
- ระบุชื่อมอดและเวอร์ชัน (`claude plugin list`), เวอร์ชัน Claude Code (`claude --version`) และขั้นตอนทำซ้ำ (Steps to reproduce)

### ขอบเขต (Scope)

**อยู่ในขอบเขต:**
- เทคนิคที่ทำให้ข้อมูลส่วนบุคคล (PDPA) หรือ Secret/Credentials หลุดผ่านตัวป้องกันของ `prime-guard` สำหรับรูปแบบที่ระบุว่ารองรับ
- มอดมีการเรียกเครือข่าย โปรเซส หรือส่งข้อมูลออกนอกเครื่องโดยไม่ได้ระบุไว้ในเอกสาร
- ช่องโหว่ด้านความปลอดภัยใน CI หรือสคริปต์อัตโนมัติของโครงการ

**อยู่นอกขอบเขต:**
- ช่องโหว่ในตัว Claude Code เอง หรือบริการของ Anthropic (โปรดรายงานต่อ Anthropic โดยตรง)
- รูปแบบข้อมูลที่อยู่นอกขอบเขตตามที่ระบุไว้ในเอกสารข้อจำกัด (เช่น ไฟล์แนบรูปภาพ/ไบนารีที่ตัวตรวจจับข้อความไม่ได้อ่าน)
- ผลบวกลวงทั่วไป (False Positives) ที่ข้อความธรรมดาถูกตรวจจับผิด — สามารถเปิด issue ทั่วไปได้

---

<a id="en"></a>

## English

### Supported Versions

Security updates are applied to the latest release of each mod in the Prime Studio suite:

| Mod | Supported Version |
| --- | --- |
| `prime-guard` | 1.0.x |
| `prime-ctbar` | 1.0.x |
| `prime-agents-panel` | 1.0.x |
| `prime-workflow` | 1.0.x |

To update:
```bash
claude plugin marketplace update prime-studio-mods
claude plugin update <mod-name>@prime-studio-mods
```

### Reporting a Vulnerability

**Please do not report security vulnerabilities in public issues.**

1. Report privately via [GitHub Private Security Advisory](https://github.com/settanun-prime/prime-studio-mods/security/advisories/new).
2. Or contact the maintainer via GitHub: [@settanun-prime](https://github.com/settanun-prime).

**Reporting Guidelines:**
- **Never submit real personal data or production credentials**: Always use fake or sanitized samples that reproduce the issue.
- Include the mod and version (`claude plugin list`), Claude Code version (`claude --version`), and steps to reproduce.

### Scope

**In Scope:**
- Bypasses that reliably leak personal data or secrets past `prime-guard` for formats specified as supported.
- Undocumented network, process, or external calls made by any mod.
- Security vulnerabilities in project CI or harness scripts.

**Out of Scope:**
- Vulnerabilities in Claude Code itself or Anthropic services (report directly to Anthropic).
- Known limits documented in the guides (e.g., binary files or image attachments not inspected by text detectors).
- False positives where harmless text is flagged (please open a regular issue).
