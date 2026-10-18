import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { findSensitive, identity, issuedTag, learnIdentity, newTags, plan, redact, scrub, secretCount } from './detect'
import { PUBLISH, toolGuard } from './guard'
import { scanPublish } from './publish'

// Every row the conversation keeps passes session.append first, so rewriting there keeps
// detected values out of the request and the stored row. Request-only text (@file attachments,
// memory files, context blocks) has its own hooks below. Best effort: regexes, not a DPO.
// See README Limits for what this does not cover.
const guardMode = atom({ plugin: 'prime-guard', key: 'guardMode' } as const, 'redact')
const isBlurOn = atom({ plugin: 'prime-guard', key: 'isBlurOn' } as const, true)
// recording mode: the mask stays on and hover no longer reveals it
const isRecording = atom({ plugin: 'prime-guard', key: 'isRecording' } as const, false)
const tagSuffix = atom({ plugin: 'prime-guard', key: 'tagSuffix' } as const, '')

const MODES = ['redact', 'block', 'off'] as const
type Mode = (typeof MODES)[number]

const HELP: Record<Mode, string> = {
  redact: 'redact: ปกปิดข้อมูลส่วนบุคคลก่อนส่งให้ Claude (ค่าเริ่มต้น)',
  block: 'block: ไม่ส่งพรอมต์ที่มีข้อมูลส่วนบุคคล และปกปิดผลลัพธ์ของเครื่องมือ',
  off: 'off: ปิดการป้องกัน',
}

// ponytail: a cell UI cannot blur pixels, so the real text is drawn grey-on-grey (width and
// wrapping stay stable) and hover swaps in readable colours. Raw colours, not theme keys, so
// it reads on light and dark. Selecting and copying still yields the real text.
const BLUR = { color: '#6b7280', backgroundColor: '#6b7280' }
const REVEAL = { color: '#ffffff', backgroundColor: '#b45309' }
const DISPLAY_MAX = 100_000

// one random-enough suffix per session, kept in state so a hot reload keeps it; it marks the
// tags this session issued. Read first: a write on every call makes parallel hooks (attachment,
// context, append) fight over the atom until update() gives up. Only a first call writes.
async function suffix($: EngineInterface) {
  const cur = await read($, tagSuffix)
  if (cur) return cur
  const fresh = (await $.clock.now()).toString(36).slice(-5)
  try {
    await update($, tagSuffix, c => c || fresh)
  } catch {
    // another hook wrote first and kept its value; read it below
  }
  return (await read($, tagSuffix)) || fresh
}

// who this machine says the user is, and what it calls itself: hidden wherever they turn up. The environment
// gives most of it (see identity()); these three ask the machine. A command that fails just adds nothing.
async function learn($: EngineInterface) {
  const out = async (argv: string[]) => {
    try {
      const r = await $.process.run(argv, { timeoutMs: 5000 })
      return r.exitCode === 0 ? r.stdout.trim() : ''
    } catch {
      return ''
    }
  }
  const [who, host, gitName] = await Promise.all([out(['whoami']), out(['hostname']), out(['git', 'config', '--global', 'user.name'])])
  const [domain, account] = who.includes('\\') ? who.split('\\') : ['', who]
  learnIdentity({ users: [account, gitName], hosts: [host, domain] })
}

async function showStatus($: EngineInterface) {
  $.ui.status(`Guard: ${await read($, guardMode)}${(await read($, isRecording)) ? ' · REC' : ''}`)
}

// the tree for a row holding personal data, or null to leave the engine's own drawing
function draw($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], text: string, id: string, isLocked: boolean) {
  if (text.length > DISPLAY_MAX) return null
  const spans = findSensitive(text)
  if (spans.length === 0) return null
  const parts = plan(text, spans)
  const { Box, Text } = $.ui.resolve(e)

  const items = parts.flatMap((chunk, ci) =>
    'pieces' in chunk
      ? chunk.pieces.map((p, pi) =>
          !p.hidden ? (
            <Text key={`${id}-${ci}-${pi}`}>{p.text}</Text>
          ) : isLocked ? (
            <Text key={`${id}-${ci}-${pi}`} {...BLUR}>{p.text}</Text>
          ) : (
            // a hover cannot recolour a Text, so a readable copy lies over the mask, shown only while the pointer is on it
            <Box key={`${id}-${ci}-${pi}`}>
              <Text {...BLUR}>{p.text}</Text>
              <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }}>
                <Text {...REVEAL}>{p.text}</Text>
              </Box>
            </Box>
          ),
        )
      : [<Text key={`${id}-${ci}`}>{chunk.md}</Text>],
  )

  return (
    <Box flexDirection="row" flexWrap="wrap">
      {items}
    </Box>
  )
}

// the prompt checks, apart from the hook so the hook can fail closed around it
async function guardPrompt($: EngineInterface, e: any, next: (e: any) => Promise<any>, mode: string) {
  // a credential is never sent, whatever the mode: redacting a password would still send it to the model
  const secrets = secretCount(e.text)
  if (secrets > 0) {
    $.ui.toast(`Prime Guard: พบรหัสลับ/token ${secrets} รายการ ไม่ส่งพรอมต์นี้ให้ Claude`)
    return { drop: 'Prime Guard blocked this prompt: it contains a credential (API key, token, password or private key). Remove it; keep secrets in an environment variable or a file the tools read on this machine.' }
  }
  const { text, found } = redact(e.text, newTags(await suffix($)))
  // a picture or a file is not text: nothing here can read what is inside it
  const attached = e.attachments?.length ?? 0
  if (attached > 0) {
    if (mode === 'block') {
      $.ui.toast(`Prime Guard: ไม่ส่งรูป/ไฟล์แนบ ${attached} รายการ ตรวจข้อมูลส่วนบุคคลในรูปไม่ได้`)
      return { drop: 'Prime Guard blocked this prompt: it carries an image or file, and the guard cannot read personal data inside one. Describe it in text, or run /prime-guard redact | off.' }
    }
    $.ui.toast(`Prime Guard: รูป/ไฟล์แนบ ${attached} รายการไม่ถูกตรวจ ดูให้แน่ใจว่าไม่มีข้อมูลส่วนบุคคล`)
  }
  if (found === 0) return next(e)
  // the engine does not apply a rewrite of a slash command's line: say so instead of claiming a redaction
  if (e.command && mode !== 'block') {
    $.ui.toast(`Prime Guard: พบข้อมูลส่วนบุคคล ${found} รายการในอาร์กิวเมนต์ของ /${e.command.name} ซึ่งปกปิดไม่ได้ ใช้ /prime-guard block เพื่อไม่ส่ง`)
    return next(e)
  }
  if (mode === 'block') {
    $.ui.toast(`Prime Guard: พบข้อมูลส่วนบุคคล ${found} รายการ ไม่ส่งพรอมต์นี้ให้ Claude`)
    return { drop: 'Prime Guard blocked this prompt: it contains personal data. Edit it, or run /prime-guard redact | off.' }
  }
  $.ui.toast(`Prime Guard: ปกปิดข้อมูลส่วนบุคคล ${found} รายการก่อนส่งให้ Claude`)
  return next({ ...e, text })
}

const runGuard = async ($: EngineInterface, e: { args: string }) => {
  const arg = e.args.trim().toLowerCase()
  const [word, value] = arg.split(/\s+/)
  if (arg === 'names') {
    const { users, hosts } = identity()
    return {
      text: `ซ่อนชื่อผู้ใช้ ${users.length} ชื่อ และชื่อเครื่อง ${hosts.length} ชื่อ (ไม่แสดงค่า)\nเพิ่มด้วยตัวแปร PRIME_GUARD_NAMES=ชื่อ1,ชื่อ2  ยกเว้นด้วย PRIME_GUARD_KEEP=ชื่อ1,ชื่อ2`,
    }
  }
  const next = MODES.find(m => m === arg)
  if (next) {
    await update($, guardMode, () => next)
    await showStatus($)
    return { text: `โหมดป้องกัน Prime Guard → ${HELP[next]}` }
  }
  const mode = (await read($, guardMode)) as Mode
  return { text: `โหมดปัจจุบัน ${HELP[mode]}\nเปลี่ยนด้วย /prime-guard ${MODES.join(' | ')}` }
}

const runBlur = async ($: EngineInterface, e: { args: string }) => {
  const arg = e.args.trim().toLowerCase()
  const wasShown = (await read($, isBlurOn)) || (await read($, isRecording))
  const want = arg === 'on' || arg === 'off' || arg === 'record' ? arg : arg === '' ? (wasShown ? 'off' : 'on') : null
  if (want === null) return { text: 'Usage: /prime-blur [on | off | record]  (no argument toggles on/off)' }
  await update($, isBlurOn, () => want !== 'off')
  await update($, isRecording, () => want === 'record')
  await showStatus($)
  return {
    text: {
      on: 'Prime blur on. Hover a grey block to reveal it.',
      off: 'Prime blur off.',
      record:
        'Prime blur: recording mode. Matches in messages stay masked and hover does not reveal them. ' +
        'Not covered: the prompt box while you type, tool output, command output. Turn off with /prime-blur off.',
    }[want],
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prime-guard',
      description: 'Prime guard: redact | block | off (no argument shows the current mode)',
    })
    await $.command.register({
      name: 'prime-blur',
      description: 'Prime blur in the transcript: on | off | record (record = no hover reveal, for screen recording)',
    })
    // the short names the README and the refusal texts give; each is answered by the same handler below
    for (const [name, of] of [['guard', 'prime-guard'], ['pdpa-guard', 'prime-guard'], ['blur', 'prime-blur'], ['pdpa-blur', 'prime-blur']]) {
      await $.command.register({ name, description: `Alias of /${of}` }).catch(() => {}) // a name another command holds stays theirs
    }
    await showStatus($)
    void learn($).catch(() => {})
    return next(e)
  })



  on('command.run', { command: 'prime-guard' }, runGuard)
  on('command.run', { command: 'guard' }, runGuard)
  on('command.run', { command: 'pdpa-guard' }, runGuard)

  // the prompt first, so even the queue record of what you typed is clean
  // a detector that throws must not let the text through unchecked: a hook that fails is skipped by the engine, and the
  // prompt would go out whole. Closed instead; /prime-guard off is the way out and is not behind this hook.
  on('prompt.submit', async ($, e, next) => {
    const mode = await read($, guardMode)
    if (mode === 'off') return next(e)
    try {
      return await guardPrompt($, e, next, mode)
    } catch {
      $.ui.toast('Prime Guard: ตรวจพรอมต์ไม่สำเร็จ ไม่ส่งให้ Claude (ปิดด้วย /prime-guard off)')
      return { drop: 'Prime Guard could not check this prompt, so it was not sent. Try again, or run /prime-guard off.' }
    }
  }).catch(($, e, next) => (next.called ? next(e) : { drop: 'Prime Guard could not check this prompt in time, so it was not sent. Try again, or run /prime-guard off.' }))

  // everything the conversation keeps: tool results, hook context, deliveries. Not the model's
  // own responses or compaction summaries (written by the model from text already redacted, so
  // nothing new reaches it) and not notices (the model never reads them).
  on('session.append', async ($, e, next) => {
    if (e.door === 'response' || e.door === 'compaction' || e.door === 'notice') return next(e)
    if ((await read($, guardMode)) === 'off') return next(e)
    const hits = { n: 0 }
    const content = scrub(e.message.content, hits, newTags(await suffix($))) as typeof e.message.content
    if (hits.n === 0) return next(e)
    $.ui.toast(`Prime Guard: ปกปิดข้อมูลส่วนบุคคล ${hits.n} รายการก่อนส่งให้ Claude`)
    return next({ ...e, message: { ...e.message, content } })
  })

  // text that only rides a request and never becomes a row: @file mentions, edited files,
  // memory (CLAUDE.md) and the other context blocks
  on('prompt.attachment', async ($, e, next) => {
    if ((await read($, guardMode)) === 'off') return next(e)
    const { text, found } = redact(e.text, newTags(await suffix($)))
    return found === 0 ? next(e) : next({ ...e, text })
  })

  on('prompt.context', async ($, e, next) => {
    if ((await read($, guardMode)) === 'off') return next(e)
    const tags = newTags(await suffix($))
    return next({ ...e, blocks: e.blocks.map(b => ({ ...b, text: redact(b.text, tags).text })) })
  })

  // the model only ever sees tags for personal data; using one of this session's tags as a real
  // value in a call would corrupt the user's work, so refuse and say why
  on('tool.call', async ($, e, next) => {
    if ((await read($, guardMode)) === 'off') return next(e)
    let verdict: ReturnType<typeof toolGuard> = null
    try {
      if (issuedTag(await suffix($)).test(JSON.stringify(e))) {
        return { deny: 'Prime Guard hides personal data from you behind placeholder tags. Do not use a tag as a real value; ask the user for it, or have them run /prime-guard off.' }
      }
      // the secret files stay closed, and nothing carrying a credential or personal data leaves through a tool
      verdict = toolGuard(e as unknown as Parameters<typeof toolGuard>[0])
      // a push or a release publishes what the commits hold, not just what the command line says
      const cmd = (e as { command?: unknown }).command
      if (!verdict && typeof cmd === 'string' && PUBLISH.test(cmd)) {
        const reason = await scanPublish((argv, cwd) => $.process.run(argv, { cwd, timeoutMs: 20_000 }), cmd)
        if (reason) verdict = { reason }
      }
    } catch {
      return { deny: 'Prime Guard could not check this tool call, so it was refused. Try again, or have the user run /prime-guard off.' }
    }
    if (verdict) {
      $.ui.toast('Prime Guard: ปฏิเสธการเรียกเครื่องมือที่แตะไฟล์ลับหรือส่งข้อมูลออกนอกเครื่อง')
      return { deny: verdict.reason }
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'Prime Guard could not check this tool call in time, so it was refused. Try again, or have the user run /prime-guard off.' }))



  on('command.run', { command: 'prime-blur' }, runBlur)
  on('command.run', { command: 'blur' }, runBlur)
  on('command.run', { command: 'pdpa-blur' }, runBlur)

  // read the toggle first so every row subscribes and redraws when it flips; no hover exists on
  // the other surfaces, and a block that cannot be revealed is worse than none
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const isActive = await read($, isBlurOn)
    const isLocked = await read($, isRecording)
    if (!isActive || (e.surface !== 'terminal' && e.surface !== 'desktop')) return next(e)
    return draw($, e, e.props.text, e.requestId, isLocked) ?? next(e)
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const isActive = await read($, isBlurOn)
    const isLocked = await read($, isRecording)
    if (!isActive || (e.surface !== 'terminal' && e.surface !== 'desktop')) return next(e)
    return draw($, e, e.props.text, e.requestId, isLocked) ?? next(e)
  })
}
