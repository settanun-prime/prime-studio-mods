// What counts as sensitive follows Thailand's PDPA B.E. 2562 (checked 2026-10-04):
//   s.6  personal data: anything identifying a natural person directly or indirectly
//   s.26 sensitive data: ethnicity, race, political opinion, creed/religion/philosophy, sexual
//        behaviour, criminal record, health, disability, trade union, genetic, biometric
// https://www.pdpc.or.th/wp-content/uploads/2023/12/1_Personal-Data-Protection-2562.pdf
// A regex cannot read s.26 from prose, so those are caught as `label: value` only. Best effort,
// not legal advice. Every scan here is linear in the input: this runs on every tool result.

export type Kind =
  | 'THAI_ID' | 'CARD' | 'PHONE' | 'EMAIL' | 'IP' | 'SECRET' | 'PASSPORT'
  | 'BANK_ACCOUNT' | 'DOB' | 'SENSITIVE' | 'ADDRESS' | 'NAME'
  | 'USERNAME' | 'HOST' | 'MAC' | 'KEY' | 'SID' | 'DEVICE'
export type Span = [start: number, end: number, kind: Kind]
export type Piece = { text: string; hidden: boolean }
export type Chunk = { md: string } | { pieces: Piece[] }

type Hit = [number, number]
type Rule = { kind: Kind; find: (s: string) => Iterable<Hit> }

// Rules run on a shadow of the text with the same length: Thai digits become Arabic and exotic
// horizontal spaces become ' ', so offsets still index the original.
const norm = (t: string) =>
  t
    .replace(/[๐-๙]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0e50 + 48))
    .replace(/[   -   　\t]/g, ' ')

const digits = (s: string) => s.replace(/\D/g, '')

// mod-11 check digit of the 13-digit Thai national ID
const thaiId = (s: string) => {
  const d = digits(s)
  if (d.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i)
  return (11 - (sum % 11)) % 10 === Number(d[12])
}

const luhn = (d: string) => {
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2
    sum += n
  }
  return sum % 10 === 0
}

// +66 / 0066 / trunk 0, then 8 digits (landline: 2 Bangkok, 3-7 provinces) or 9 (mobile 6/8/9)
const thaiPhone = (s: string) => {
  const d = digits(s)
  const n = d.startsWith('0066') ? d.slice(4) : s.startsWith('+') && d.startsWith('66') ? d.slice(2) : d.startsWith('0') ? d.slice(1) : ''
  return (n.length === 8 && /^[2-7]/.test(n)) || (n.length === 9 && /^[689]/.test(n))
}

// not an address of a machine: loopback, "this network" (0.x.x.x is also how a four-part version number looks,
// 0.2.0.0), and the three blocks RFC 5737 sets aside for documentation
const DOC_NET = /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./
const ipv4 = (s: string) => {
  const p = s.split('.').map(Number)
  return p.every(n => n <= 255) && p[0] !== 127 && p[0] !== 0 && !DOC_NET.test(s)
}

// a value that is code, not a secret: a type name, a dotted path, a call, a template, a shell var
const CODE_VALUE =
  /^(?:string|number|boolean|any|unknown|undefined|null|true|false|void|never|object|str|int|bool|None|Optional.*|Record.*|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?:[(\[].*)?|[A-Za-z_$][\w$]*\(.*|\$\{.*|\$[A-Za-z_]\w*|\{\{.*|<.*>|%\(.*|\*+|\.{3})$/

function re(kind: Kind, regex: RegExp, o: { groups?: number[]; ok?: (v: string) => boolean } = {}): Rule {
  return {
    kind,
    *find(s) {
      for (const m of s.matchAll(regex)) {
        const at = (o.groups ?? [0]).map(g => m.indices?.[g]).find(Boolean)
        if (at && at[1] > at[0] && (!o.ok || o.ok(s.slice(at[0], at[1])))) yield [at[0], at[1]]
      }
    },
  }
}

// a number shaped like a payment card: the issuer's leading digits and a length that issuer uses.
// Luhn alone passes one number in ten (a 14-digit timestamp, "197609 10348 2026" out of `ls -l`), which
// turned file names and migration ids into card tags.
const cardShape = (d: string) =>
  (/^4/.test(d) && [13, 16, 19].includes(d.length)) || // Visa
  (/^(?:5[1-5]|2(?:2[2-9]|[3-6]|7[01]|720))/.test(d) && d.length === 16) || // Mastercard
  (/^3[47]/.test(d) && d.length === 15) || // Amex
  (/^3(?:0[0-5]|[689])/.test(d) && d.length >= 14 && d.length <= 19) || // Diners
  (/^(?:6011|65|64[4-9]|62|35(?:2[89]|[3-8]))/.test(d) && d.length >= 16 && d.length <= 19) // Discover, UnionPay, JCB

// printed the way a card is: one run, 4-4-4-4 (up to 19 digits), 4-6-5 (Amex) or 4-6-4 (Diners)
const GROUPED = /^(?:\d{13,19}|\d{4}(?:[ -]\d{4}){3}(?:[ -]\d{1,3})?|\d{4}[ -]\d{6}[ -]\d{4,5})$/

// the longest run of 13-19 digits (groups split by space or -) that passes Luhn and looks like a card, cut at a group
// boundary so a trailing stray digit cannot hide a real card
function* cards(s: string): Iterable<Hit> {
  for (const m of s.matchAll(/(?<!\d)\d(?:[ -]?\d){12,21}(?!\d)/g)) {
    const base = m.index
    const text = m[0]
    const starts: number[] = [0]
    const ends: number[] = []
    for (let i = 0; i < text.length; i++) {
      if (!/\d/.test(text[i])) starts.push(i + 1)
      else if (i + 1 === text.length || !/\d/.test(text[i + 1])) ends.push(i + 1)
    }
    // digits before each offset: the length test costs nothing, and only a window of 13-19 digits is cut and checked
    const seen: number[] = [0]
    for (let i = 0; i < text.length; i++) seen.push(seen[i] + (/\d/.test(text[i]) ? 1 : 0))
    let best: Hit | null = null
    for (const a of starts) {
      // an issuer's number opens with 2-6
      if (!/[2-6]/.test(text[a] ?? '')) continue
      for (const b of ends) {
        const n = seen[b] - seen[a]
        if (b <= a || n < 13 || n > 19) continue
        const d = digits(text.slice(a, b))
        if (luhn(d) && cardShape(d) && GROUPED.test(text.slice(a, b)) && (!best || b - a > best[1] - best[0])) best = [a, b]
      }
    }
    if (best) yield [base + best[0], base + best[1]]
  }
}

// a linear scan outward from each '@', so no input makes it quadratic
function* emails(s: string): Iterable<Hit> {
  const local = /[A-Za-z0-9._%+-]/
  const host = /[A-Za-z0-9.-]/
  for (let at = s.indexOf('@'); at !== -1; at = s.indexOf('@', at + 1)) {
    let a = at
    while (a > 0 && at - a < 64 && local.test(s[a - 1])) a--
    let b = at + 1
    while (b < s.length && b - at < 255 && host.test(s[b])) b++
    while (b > at + 1 && /[.-]/.test(s[b - 1])) b--
    const dom = s.slice(at + 1, b)
    // an address made to be public is not personal data: GitHub's noreply form, and noreply@ senders
    if (/^(?:users\.noreply\.github\.com|noreply\.github\.com)$/i.test(dom) || /^(?:no-?reply|do-?not-?reply)(?:[+.].*)?$/i.test(s.slice(a, at))) continue
    if (a < at && /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(dom) && !/^example\.(?:com|org|net)$/i.test(dom)) yield [a, b]
  }
}

const COLON = `["']?[ \\t]*[:：=][ \\t]*["']?`
// the value of `label: value`: starts at a non-blank (keeps scanning linear), runs to a delimiter,
// trailing blanks excluded; a value opening with [ or { (an array or object) is not matched
const VALUE = `([^\\s,;"'}\\[{](?:[^\\n,;"'}]*[^\\s,;"'}])?)`
const labelled = (kind: Kind, labels: string) =>
  re(kind, new RegExp(`(?:${labels})${COLON}${VALUE}`, 'gdi'), { groups: [1] })

const SENSITIVE_LABEL =
  'เชื้อชาติ|เผ่าพันธุ์|ศาสนา|ความเชื่อ|ลัทธิ|ความคิดเห็นทางการเมือง|พฤติกรรมทางเพศ|ประวัติอาชญากรรม|โรคประจำตัว|ประวัติการรักษา|ข้อมูลสุขภาพ|ความพิการ|สหภาพแรงงาน|ข้อมูลพันธุกรรม|ข้อมูลชีวภาพ|' +
  'race|ethnicity|religion|political(?: opinion)?|sexual (?:orientation|behaviou?r)|criminal (?:record|history)|medical history|diagnosis|health (?:condition|data)|disability|trade union|genetic(?: data)?|biometric(?: data)?'

// นาย/นาง/นางสาว/ด.ช./ด.ญ. + name, minus the compounds that merely start with a title
const NOT_A_NAME = 'จ้าง|หน้า|ก(?:รัฐ|เทศ|สมาคม|ฯ)|ทะเบียน|ธนาคาร|ช่าง|อำเภอ|แพทย์|ตำรวจ|พยาบาล|งาม|ฟ้า|ท้าย|ท่า|เหมือง|ห้าง|ประกัน'

// ---- who and where ------------------------------------------------------------------------------
// The names this machine uses for the user and for itself are read from the environment and learned
// at session start (whoami, hostname, git user.name), then hidden wherever they appear: a bare
// `ls -l` owner column, a prompt, a log line. Extra names: PRIME_GUARD_NAMES=a,b. Names to leave
// visible: PRIME_GUARD_KEEP=a,b. The older PDPA_GUARD_* names still work.
type Names = { users: string[]; hosts: string[] }
let learned: Names = { users: [], hosts: [] }
let override: Names | null = null

// a common word is not a name worth hiding: it would blank half of every path and log line
const GENERIC = new Set(['root', 'admin', 'administrator', 'user', 'users', 'default', 'public', 'guest', 'system', 'test', 'runner', 'ubuntu', 'docker', 'localhost', 'host', 'home', 'desktop', 'laptop', 'server', 'client', 'pc'])
const envVar = (k: string): string => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k] ?? ''
const lastPart = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? ''
const csv = (s: string) => s.split(/[,;]/).map(x => x.trim()).filter(Boolean)
const clean = (xs: string[], keep: Set<string>) =>
  [...new Set(xs.map(x => x.trim()).filter(x => x.length >= 3 && !GENERIC.has(x.toLowerCase()) && !keep.has(x.toLowerCase())))].sort((a, b) => b.length - a.length).slice(0, 40)

export function identity(): Names {
  if (override) return override
  const keep = new Set(csv(envVar('PRIME_GUARD_KEEP') || envVar('PDPA_GUARD_KEEP')).map(x => x.toLowerCase()))
  const users = [envVar('USERNAME'), envVar('USER'), envVar('LOGNAME'), lastPart(envVar('USERPROFILE')), lastPart(envVar('HOME')), ...csv(envVar('PRIME_GUARD_NAMES') || envVar('PDPA_GUARD_NAMES')), ...learned.users]
  const hosts = [envVar('COMPUTERNAME'), envVar('HOSTNAME'), envVar('USERDOMAIN'), ...learned.hosts]
  return { users: clean(users, keep), hosts: clean(hosts, keep) }
}
export const learnIdentity = (n: Partial<Names>) => {
  learned = { users: [...learned.users, ...(n.users ?? [])], hosts: [...learned.hosts, ...(n.hosts ?? [])] }
}
/** Tests: fix the names, or null to read the machine again. */
export const setIdentity = (n: Names | null) => {
  override = n
  learned = { users: [], hosts: [] }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let compiled: { key: string; rules: Rule[] } = { key: '', rules: [] }
function ownRules(): Rule[] {
  const { users, hosts } = identity()
  const key = `${users.join('\n')}\u0000${hosts.join('\n')}`
  if (key === compiled.key) return compiled.rules
  // letters, digits, _ and - around a name mean it sits inside a longer word ("ann" is not "annual")
  const edge = (alt: string) => `(?<![\\p{L}\\p{N}_-])(?:${alt})(?![\\p{L}\\p{N}_-])`
  const rules: Rule[] = []
  if (users.length) rules.push(re('USERNAME', new RegExp(edge(users.map(esc).join('|')), 'giud')))
  // Windows writes machine names in capitals; the same word in lower case is usually just a word
  if (hosts.length) rules.push(re('HOST', new RegExp(edge([...new Set(hosts.flatMap(h => [h, h.toUpperCase()]))].map(esc).join('|')), 'gud')))
  compiled = { key, rules }
  return rules
}

// an account name that is a placeholder or a system account, not a person
const GENERIC_ACCOUNT = /^(?:public|default|default user|all users|shared|administrator|administrators|guest|user|users|runner|root|system|defaultuser0|\*+|<.*>|%.*%|\$.*|\{.*|\[.*|~.*|\.{1,2})$/i
// a hostname that is a placeholder or the machine itself
const LOCAL_NAME = /^(?:localhost|0\.0\.0\.0|127\..*|.*\.example\.(?:com|org|net)|example\.(?:com|org|net))$/i
// a value that is data, not a call, a flag, a type or a placeholder. A dotted value stays: a hostname
// (nas.local) and a user (jane.doe) look like a property path, and hiding a path to be safe is cheap.
const OK_VALUE = (v: string) => !/[()]/.test(v) && !/^(?:the|an?|to|of|is|are|and|or|in|on|at|for|with|that|this|it|you|your|can|will|not)$/i.test(v) &&!/^(?:true|false|null|none|yes|no|n\/a|required|optional|string|number|boolean|any|unknown|undefined|void)$/i.test(v) && !/^(?:[$%<{[~]|\.{3})/.test(v)

const USER_LABEL = 'user[ _-]?name|login(?:[ _-]?name)?|logon(?:[ _-]?name)?|account[ _-]?name|serverUser|USERDOMAIN|user\\.name|git[ _-]?user|github[ _-]?(?:user|login)|gh[ _-]?user|owner[ _-]?name|ชื่อผู้ใช้|user'
const HOST_LABEL = 'host[ _-]?name|computer[ _-]?name|machine[ _-]?name|server[ _-]?name|device[ _-]?name|COMPUTERNAME|node[ _-]?name|workgroup|ssid|computer|ชื่อเครื่อง|ชื่อโฮสต์'
const DEVICE_LABEL = 'serial(?:[ _-]?number)?|uuid|machine[ _-]?(?:guid|id)|device[ _-]?id|hwid|imei|imsi|product[ _-]?id|bios[ _-]?serial|account[ _-]?id|tenant[ _-]?id|subscription[ _-]?id|aws[ _-]?account'
// an account, machine or serial is one word: a sentence after "login:" is prose, not a value
const TOKEN = String.raw`([^\s,;"'}\[{][^\s,;"'}]*)`
const labelledValue = (kind: Kind, labels: string, ok: (v: string) => boolean) =>
  re(kind, new RegExp(`(?:${labels})${COLON}${TOKEN}`, 'gdi'), { groups: [1], ok })

// user@host after ssh/scp/sftp/rsync, or in a git-bash prompt. A host without a dot is not an email,
// but it names a machine. A linear scan outward from each '@'.
function* sshTargets(s: string): Iterable<Hit> {
  const local = /[A-Za-z0-9._-]/
  const host = /[A-Za-z0-9.-]/
  for (let at = s.indexOf('@'); at !== -1; at = s.indexOf('@', at + 1)) {
    let a = at
    while (a > 0 && at - a < 64 && local.test(s[a - 1])) a--
    let b = at + 1
    while (b < s.length && b - at < 255 && host.test(s[b])) b++
    while (b > at + 1 && /[.-]/.test(s[b - 1])) b--
    if (a === at || b === at + 1) continue
    const line = s.lastIndexOf('\n', a - 1) + 1
    const before = s.slice(Math.max(line, a - 300), a)
    // the program, lower case, as a word of its own (not "SSH" in a sentence, not the start of "ssh-lan")
    if (/(?:^|[\s;|&(])(?:ssh|scp|sftp|rsync|sshfs|mosh)(?:\.exe)?\s/.test(before) || /^[ \t]+(?:MINGW|MSYS|UCRT|CLANG)/.test(s.slice(b, b + 16))) yield [a, b]
  }
}

const RULES: Rule[] = [
  re('THAI_ID', /(?<!\d)\d[ -]?\d{4}[ -]?\d{5}[ -]?\d{2}[ -]?\d(?!\d)/gd, { ok: thaiId }),
  { kind: 'CARD', find: cards },
  re('PHONE', /(?<!\d)(?:\+66|0066|0)[ -]?\d(?:[ -]?\d){7,8}(?!\d)/gd, { ok: thaiPhone }),
  { kind: 'EMAIL', find: emails },
  re('IP', /(?<![\d.vV])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/gd, { ok: ipv4 }),
  // credentials and tokens
  re('SECRET', /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/gd),
  re('SECRET', /\bBearer[ \t]+([A-Za-z0-9._~+/=-]{20,})/gdi, { groups: [1] }),
  re('SECRET', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----|$)/gd),
  // a URL carrying user:password@ (postgres://, mysql://, https://, ...)
  re('SECRET', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/gid),
  re('SECRET', /\b(?:AIza[0-9A-Za-z_-]{35}|(?:sk|rk|pk)_(?:live|test)_[0-9A-Za-z]{16,}|glpat-[0-9A-Za-z_-]{20}|npm_[0-9A-Za-z]{36})\b/gd),
  // a managed database's own password and more token families (Aiven, Hugging Face, Supabase, Google OAuth, DigitalOcean, Shopify)
  re('SECRET', /\b(?:AVNS_[A-Za-z0-9_-]{12,}|hf_[A-Za-z0-9]{30,}|sbp_[0-9a-f]{40}|ya29\.[A-Za-z0-9_-]{20,}|dop_v1_[0-9a-f]{64}|shpat_[0-9a-f]{32})/gd),
  re(
    'SECRET',
    /(?:password|passwd|pwd|passphrase|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key|session[_-]?token|connection[_-]?string|webhook[_-]?url|signing[_-]?key|encryption[_-]?key|master[_-]?key|pre[_-]?shared[_-]?key|key content|set-cookie|cookie|otp|รหัสผ่าน|รหัสลับ|รหัสยืนยัน)["']?[ \t]*[:=][ \t]*(?:"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|([^\s"',;]+))/gdi,
    { groups: [1, 2, 3], ok: v => !CODE_VALUE.test(v) },
  ),
  // identifiers that only make sense next to their label
  re('PASSPORT', /(?:passport|เลขที่หนังสือเดินทาง|เลขพาสปอร์ต|พาสปอร์ต)\D{0,20}?([A-Z]{1,2}\d{6,8})\b/gdi, { groups: [1] }),
  re('BANK_ACCOUNT', /(?:เลขที่บัญชี|หมายเลขบัญชี|บัญชี|account[ \t]*(?:no\.?|number|#)|acct\.?|พร้อมเพย์|promptpay)\D{0,15}((?:\d[ -]?){9,14}\d)/gdi, { groups: [1] }),
  re('DOB', /(?:วันเกิด|date of birth|birth[ ]?date|dob)["']?[ \t]*(?:[:：][ \t]*)?["']?(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4})/gdi, { groups: [1] }),
  // s.26 sensitive categories, and name/address, as `label: value`
  labelled('SENSITIVE', SENSITIVE_LABEL),
  labelled('ADDRESS', 'ที่อยู่|home address|mailing address'),
  labelled('NAME', 'ชื่อ-?นามสกุล|ชื่อ-สกุล|ชื่อจริง|นามสกุล|ชื่อ|full[ _]?name|first[ _]?name|last[ _]?name|surname'),
  // titled names
  re('NAME', new RegExp(`(?<![ก-๙])(?:นางสาว|นาง|นาย|น\\.ส\\.|ด\\.ช\\.|ด\\.ญ\\.)(?!${NOT_A_NAME})[ \\t]*[ก-ฮเแโใไ][ก-๙]{1,30}(?:[ \\t]+[ก-ฮเแโใไ][ก-๙]{1,30})?`, 'gd')),
  re('NAME', /\b(?:Mr|Mrs|Ms|Miss|Dr)\.?[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)?/gd),  // ---- machine and account identity ----
  re('MAC', /(?<![0-9A-Fa-f:-])[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:-])/gd, { ok: v => new Set(v.toLowerCase().split(/[:-]/)).size > 1 }),
  re('SID', /\bS-1-5-21(?:-\d{4,10}){3,4}\b/gd),
  // a public key is meant to be shared, but its comment names a person and a machine, and the blob names the key
  re('KEY', /\b(?:ssh-(?:ed25519|rsa|dss)|ecdsa-sha2-nistp\d{3}|sk-(?:ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)[ \t]+AAAA[A-Za-z0-9+/]{20,}={0,3}(?:[ \t]+[^\s]+)?/gd),
  // the account folder in a profile path: C:\Users\name, /home/name, /Users/name, /c/Users/name (Git Bash), /mnt/c/Users/name (WSL)
  re('USERNAME', /(?:[A-Za-z]:[\\/]+Users[\\/]+|(?<![\w.~])\/(?:mnt\/)?[A-Za-z]\/Users\/|(?<![\w.~])\/(?:home|Users)\/)([^\\/\s"'`<>|:*?,;()[\]{}$%]+)/gd, { groups: [1], ok: v => !GENERIC_ACCOUNT.test(v) }),
  labelledValue('USERNAME', USER_LABEL, OK_VALUE),
  // ssh config and sshd_config lines
  re('USERNAME', /^[ \t]*(?:User|AllowUsers|DenyUsers)[ \t]+([^\s#]+(?:[ \t]+[^\s#]+)*)[ \t]*(?:#.*)?$/gdm, { groups: [1], ok: OK_VALUE }),
  re('HOST', /^[ \t]*Host(?:Name)?[ \t]+([^\s#*?!]+)/gdm, { groups: [1], ok: v => OK_VALUE(v) && !LOCAL_NAME.test(v) }),
  labelledValue('HOST', HOST_LABEL, v => OK_VALUE(v) && !LOCAL_NAME.test(v)),
  labelledValue('DEVICE', DEVICE_LABEL, OK_VALUE),
  { kind: 'HOST', find: sshTargets },
  // \\server\share, also as it is written inside JSON
  re('HOST', /(?<![\\\w:])\\{2,4}([A-Za-z0-9][\w.-]*)\\{1,2}[^\s\\]/gd, { groups: [1], ok: v => !LOCAL_NAME.test(v) }),
  // a URL to a machine on the local network: a single-label name or *.local / *.lan / *.internal ...
  re(
    'HOST',
    /\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@:]+(?::[^\s/@]*)?@)?((?:[A-Za-z0-9-]+\.)*(?:local|lan|internal|intranet|localdomain|corp|home\.arpa)|[A-Za-z0-9-]+)(?=[:/\s"'?#)>\]]|$)/gid,
    { groups: [1], ok: v => !LOCAL_NAME.test(v) && !/^(?:host|hostname|server|domain|example|app|api|web|\d+)$/i.test(v) },
  ),
  // IPv6: a full address, link-local, unique-local
  re('IP', /(?<![\w:])(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}(?![\w:])/gd),
  re('IP', /(?<![\w:])fe80:[0-9A-Fa-f:]*[0-9A-Fa-f](?:%[\w.-]+)?/gdi),
  re('IP', /(?<![\w:])f[cd][0-9a-f]{2}:[0-9a-f:]*[0-9a-f]/gdi),
  // more token families
  re('SECRET', /\b(?:github_pat_[A-Za-z0-9_]{22,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|\d{8,10}:AA[A-Za-z0-9_-]{33}|hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+|discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+|AccountKey=[A-Za-z0-9+/=]{40,}|xapp-\d-[A-Za-z0-9-]{20,}|pypi-[A-Za-z0-9_-]{50,}|ASIA[0-9A-Z]{16})/gd),
  re('SECRET', /\bAuthorization["']?[ \t]*[:=][ \t]*["']?(?:Basic|Digest|Token|ApiKey)[ \t]+([A-Za-z0-9+/=._~-]{12,})/gdi, { groups: [1] }),
  // git identity in a log or a trailer
  re('NAME', /^(?:Author|Committer|Signed-off-by|Co-authored-by|Reviewed-by|Tagger)[ \t]*:[ \t]*([^<\n]+?)[ \t]*(?:<|$)/gdim, { groups: [1], ok: v => !/claude|anthropic|copilot|github-actions|dependabot|\[bot\]|noreply/i.test(v) }),
]

// The tag that replaces a value: kind, a number, and a per-session suffix. The suffix makes a tag
// this session issued recognisable, so only a real tag is refused in a tool call, not a document
// or test that merely mentions the format.
const TAG = 'RE' + 'DACTED'
const PLACEHOLDER = new RegExp(`\\[${TAG}:([A-Z_]+)_(\\d+)(?:~[a-z0-9]+)?\\]`, 'g')

export const issuedTag = (sfx: string) => new RegExp(`\\[${TAG}:[A-Z_]+_\\d+~${sfx}\\]`)

export function findSensitive(text: string): Span[] {
  const s = norm(text)
  const found: Span[] = []
  for (const rule of [...RULES, ...ownRules()]) for (const [a, b] of rule.find(s)) found.push([a, b, rule.kind])
  found.sort((x, y) => x[0] - y[0] || y[1] - x[1])

  // a tag from an earlier pass is never re-detected, so redaction is idempotent
  const held = [...s.matchAll(PLACEHOLDER)].map(m => [m.index, m.index + m[0].length])
  const free = held.length ? found.filter(([a, b]) => !held.some(([ha, hb]) => a < hb && b > ha)) : found

  const merged: Span[] = []
  for (const sp of free) {
    const last = merged[merged.length - 1]
    if (last && sp[0] < last[1]) last[1] = Math.max(last[1], sp[1])
    else merged.push([sp[0], sp[1], sp[2]])
  }
  return merged
}

// how many credentials or keys the text holds: a prompt holding any is never sent
export const secretCount = (text: string) => findSensitive(text).filter(([, , kind]) => kind === 'SECRET').length

export type Tags = { sfx: string; seen: Map<string, number>; counts: Partial<Record<Kind, number>> }
export const newTags = (sfx = ''): Tags => ({ sfx, seen: new Map(), counts: {} })

// Replaces each span with a tag the model can still refer to (PHONE_1); the same value gets the
// same tag across everything sharing one `tags`. Irreversible on purpose: the mod keeps no
// mapping back to the original value. Numbers already present in the text are reserved, never reused.
export function redact(text: string, tags: Tags = newTags()): { text: string; found: number } {
  const spans = findSensitive(text)
  if (spans.length === 0) return { text, found: 0 }
  const s = norm(text)
  for (const m of s.matchAll(PLACEHOLDER)) {
    const kind = m[1] as Kind
    tags.counts[kind] = Math.max(tags.counts[kind] ?? 0, Number(m[2]))
  }
  let out = ''
  let at = 0
  for (const [a, b, kind] of spans) {
    const key = `${kind}:${s.slice(a, b)}`
    let n = tags.seen.get(key)
    if (!n) {
      n = tags.counts[kind] = (tags.counts[kind] ?? 0) + 1
      tags.seen.set(key, n)
    }
    out += `${text.slice(at, a)}[${TAG}:${kind}_${n}${tags.sfx ? `~${tags.sfx}` : ''}]`
    at = b
  }
  return { text: out + text.slice(at), found: spans.length }
}

function pieces(text: string, ls: number, le: number, spans: Span[]): Piece[] {
  const out: Piece[] = []
  let at = ls
  for (const [s, e] of spans) {
    if (e <= ls || s >= le) continue
    const a = Math.max(s, ls)
    const b = Math.min(e, le)
    if (a > at) out.push({ text: text.slice(at, a), hidden: false })
    out.push({ text: text.slice(a, b), hidden: true })
    at = b
  }
  if (at < le) out.push({ text: text.slice(at, le), hidden: false })
  return out
}

// Clean stretches stay Markdown; a line holding a span (or a whole code fence holding one) is
// drawn as plain pieces so each hidden span can carry its own hover. Fences are never split.
export function plan(text: string, spans: Span[]): Chunk[] {
  const units: { s: number; e: number; lines: [number, number][] }[] = []
  let at = 0
  let fence: (typeof units)[number] | null = null
  for (const line of text.split('\n')) {
    const span: [number, number] = [at, at + line.length]
    at += line.length + 1
    const isFence = /^\s*(```|~~~)/.test(line)
    if (fence) {
      fence.lines.push(span)
      fence.e = span[1]
      if (isFence) fence = null
    } else if (isFence) {
      fence = { s: span[0], e: span[1], lines: [span] }
      units.push(fence)
    } else units.push({ s: span[0], e: span[1], lines: [span] })
  }

  const out: Chunk[] = []
  let cleanFrom: number | null = null
  let cleanTo = 0
  const flush = () => {
    if (cleanFrom !== null) out.push({ md: text.slice(cleanFrom, cleanTo) })
    cleanFrom = null
  }
  for (const u of units) {
    if (spans.some(([s, e]) => s < u.e && e > u.s)) {
      flush()
      for (const [ls, le] of u.lines) out.push({ pieces: pieces(text, ls, le, spans) })
    } else {
      cleanFrom ??= u.s
      cleanTo = u.e
    }
  }
  flush()
  return out
}

export type Hits = { n: number }

// a row's content is a string or blocks; only text and tool_result text are rewritten. One tag
// table per row, so a value repeated across blocks keeps one tag and numbers never collide.
export function scrub(content: unknown, hits: Hits, tags: Tags = newTags()): unknown {
  if (typeof content === 'string') {
    const r = redact(content, tags)
    hits.n += r.found
    return r.text
  }
  if (!Array.isArray(content)) return content
  return content.map(block => {
    if (block?.type === 'text' && typeof block.text === 'string') {
      const r = redact(block.text, tags)
      hits.n += r.found
      return { ...block, text: r.text }
    }
    return block?.type === 'tool_result' ? { ...block, content: scrub(block.content, hits, tags) } : block
  })
}
