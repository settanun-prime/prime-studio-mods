import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Debris, Fill } from '../types'

const fill = atom({ plugin: 'prime-ctbar', key: 'fill' } as const, null)
const isHidden = atom({ plugin: 'prime-ctbar', key: 'isHidden' } as const, false)
const cache = atom({ plugin: 'prime-ctbar', key: 'cache' } as const, null)
// in $.state, not a module variable: a hot reload would lose it and freeze the countdown
const endsAt = atom({ plugin: 'prime-ctbar', key: 'endsAt' } as const, null)
// percent of the window at which the mod compacts between turns; null = off
const autoAt = atom({ plugin: 'prime-ctbar', key: 'autoAt' } as const, 85 as number | null)
const AUTO_DEFAULT = 85
// true once this host refused $.session.compact: every later press goes straight to /compact
const headless = atom({ plugin: 'prime-ctbar', key: 'headless' } as const, false)
// the button's face: its label shatters when pressed, spins while compacting, then builds back
const btnLabel = atom({ plugin: 'prime-ctbar', key: 'btnLabel' } as const, 'compact')
// while the button is pressed the bar is drawn as rubble: these glyphs in each category's colour, shaken `nudge` cells right
const debris = atom({ plugin: 'prime-ctbar', key: 'debris' } as const, null as Debris | null)
const isSoundOn = atom({ plugin: 'prime-ctbar', key: 'isSoundOn' } as const, true)
// the colour of its label; /prime-ctbar color <name | #hex | default> changes it
const btnColor = atom({ plugin: 'prime-ctbar', key: 'btnColor' } as const, '#7dd3fc')
const BTN_DEFAULT = '#7dd3fc'
// the bar shakes, cracks and crumbles to dust, then is built back up from the rubble once the compaction answers
const BREAK: { label: string; debris: Debris | null }[] = [
  { label: 'compact', debris: { glyphs: '█', nudge: 1 } },
  { label: 'c0mpact', debris: { glyphs: '█▓', nudge: 0 } },
  { label: 'c0mp4c7', debris: { glyphs: '▓█▓▒', nudge: 1 } },
  { label: 'c▒m▓a░t', debris: { glyphs: '▒▓░▒', nudge: 0 } },
  { label: '░ ▒ ░ ▓', debris: { glyphs: '░▒ ░', nudge: 1 } },
  { label: '·  ˙  ·', debris: { glyphs: '░ · ', nudge: 0 } },
  { label: '˙ .', debris: { glyphs: '·  ˙', nudge: 0 } },
  { label: '·', debris: { glyphs: ' .  ', nudge: 0 } },
]
const DUST: Debris = { glyphs: ' ·  ', nudge: 0 }
const REBUILD: { label: string; debris: Debris | null }[] = [
  { label: '·', debris: { glyphs: '░', nudge: 0 } },
  { label: 'co', debris: { glyphs: '▒', nudge: 0 } },
  { label: 'comp', debris: { glyphs: '▓', nudge: 0 } },
  { label: 'compac', debris: null },
  { label: 'compact', debris: null },
]
const SPIN = ['◐', '◓', '◑', '◒']
const FRAME_MS = 60
const COMPACT_KEEP = 'Keep the open task, the decisions made, file paths and the next step. Drop tool output already acted on.'
// one compaction at a time; a hot reload resets it, and the engine refuses a turn-time compact anyway
let compacting = false

// ponytail: fixed 5-minute prompt-cache TTL; set 3_600_000 if the session uses the 1h cache
const TTL_MS = 5 * 60 * 1000

const fmt = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`

const SHORT: Record<string, string> = {
  'system prompt': 'prompt',
  'system tools': 'tools',
  'mcp tools': 'mcp',
  'mcp server instructions': 'mcp instr',
  'custom agents': 'agents',
  'memory files': 'memory',
  messages: 'msgs',
  'autocompact buffer': 'buffer',
  'free space': 'free',
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// the engine refuses a compaction while a turn runs, and `turn.complete` is still inside the turn: ask again a little later
const RETRY_MS = 2000
const RETRIES = 5
const COMPACT_TIMEOUT_MS = 120_000
const TIMEOUT = 'no answer after 2 minutes'

// a host that cannot compact from a plugin (the desktop app and every SDK session: "$.session.compact: not available in a
// headless (-p / SDK) session") may still run its own /compact command; a plugin runs a command with $.command.run, not as a prompt
async function compactAsCommand($: EngineInterface, isHeadless: boolean) {
  if (isHeadless) await update($, headless, () => true)
  try {
    const r = await $.command.run({ command: 'compact', args: COMPACT_KEEP })
    $.ui.toast(r.text ? `/compact: ${r.text.slice(0, 80)}` : 'Compact: ran /compact')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.toast(`Type /compact yourself: this host will not run it for a button (${reason.slice(0, 60)})`)
  }
}

// one compaction, by the button or by the threshold; then redraws the bar
async function compact($: EngineInterface, why: string, attempt = 0) {
  if (compacting) return
  compacting = true
  let again = false
  try {
    // not a `return` here: the bar must be read again afterwards on every path
    if (await read($, headless)) await compactAsCommand($, true)
    else {
      $.ui.toast('Compacting…')
      // a compaction that never answers must not leave the flag set and every later press silent
      let timer: { cancel: () => void } | undefined
      try {
        const r = await Promise.race([
          $.session.compact({ instructions: COMPACT_KEEP }),
          new Promise<never>((_, no) => { timer = $.clock.after(COMPACT_TIMEOUT_MS, () => no(new Error(TIMEOUT))) }),
        ])
        $.ui.toast(r.skip ? `Compact skipped: ${r.skip}` : why)
      } finally {
        timer?.cancel()
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (reason === TIMEOUT) $.ui.toast('Compact: no answer after 2 minutes; it may still finish') // a /compact now could run a second one
    else if (attempt < RETRIES && /turn|running|busy|progress/i.test(reason)) again = true
    else {
      // not a busy turn: this host cannot do it from here. Say why, and ask the host's own /compact instead
      $.ui.toast(`Compact did not run: ${reason.slice(0, 80)}`)
      // only a host that says it cannot compact from a plugin sends every later press to /compact
      await compactAsCommand($, /headless|not available/i.test(reason))
    }
  } finally {
    compacting = false
  }
  if (again) {
    $.clock.after(RETRY_MS, () => { void compact($, why, attempt + 1) })
    return
  }
  await refresh($)
  refreshSoon($)
}

async function frames($: EngineInterface, list: { label: string; debris: Debris | null }[]) {
  for (const f of list) {
    await update($, btnLabel, () => f.label)
    await update($, debris, () => f.debris)
    await $.clock.sleep(FRAME_MS)
  }
}

// the press of the button: the bar and its label are smashed to dust, the dust turns while the compaction works, then both
// are built back up
async function press($: EngineInterface, why: string) {
  if (compacting || (await read($, btnLabel)) !== 'compact') return
  await frames($, BREAK)
  const job = compact($, why)
  await update($, debris, () => DUST)
  let i = 0
  while (compacting) {
    await update($, btnLabel, () => SPIN[i++ % SPIN.length])
    await $.clock.sleep(120)
  }
  await job
  await frames($, REBUILD)
}

// 8-bit chimes so the person can look away while tests run: a jingle when they pass, a buzz when they fail or a turn errors
// A test runner where a command starts (after ; | & ( or a newline, past npx, VAR=x and the like), not the word in a grep
const TEST_CMD =
  /(?:^|[;&|(\n])\s*(?:(?:npx|bunx|sudo|time|uv\s+run|poetry\s+run|pnpm\s+exec)\s+|[A-Za-z_]\w*=\S*\s+)*(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|(?:jest|vitest|mocha|pytest|phpunit|rspec|ctest|playwright\s+test)\b|python3?\s+-m\s+(?:pytest|unittest)\b|(?:go|cargo|dotnet|deno)\s+test\b|cargo\s+nextest\b|(?:\.\/)?gradlew?\s+test\b|mvn\b[^\n;&|]*\btest\b|make\s+(?:test|check)\b|claude\s+plugin\s+test\b|(?:node|bash|sh|python3?|tsx|bun)\s+[\w./\\-]*test[\w.-]*\.(?:sh|mjs|cjs|js|ts|py)\b)/i
let lastChime = Number.NEGATIVE_INFINITY
async function chime($: EngineInterface, clip: 'pass' | 'fail') {
  if (!(await read($, isSoundOn))) return
  const now = await $.clock.now()
  if (now - lastChime < 1000) return // parallel test runs ending together: one chime
  lastChime = now
  const root = $.plugin.root
  // a Windows terminal has no player behind $.audio.play; Windows' own SoundPlayer plays a WAV
  const played = /^(?:[A-Za-z]:|\\\\)/.test(root)
    ? $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${`${root}/sfx/${clip}.wav`.replace(/'/g, "''")}').PlaySync()`], { timeoutMs: 10_000 })
    : $.audio.play({ asset: `sfx/${clip}.wav` })
  void played.catch(() => {}) // no player is no reason to fail a tool call
}

// runs between turns: compacts once the window passes the threshold
let lastAutoAt = Number.NEGATIVE_INFINITY
async function maybeCompact($: EngineInterface) {
  const at = await read($, autoAt)
  const f = await read($, fill)
  if (at === null || f === null || f.pct < at) return
  const now = await $.clock.now()
  if (now - lastAutoAt < 5 * 60 * 1000) return
  lastAutoAt = now
  await compact($, `Auto compact at ${Math.round(f.pct)}%`)
}

async function refresh($: EngineInterface) {
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const b = context.breakdown
    const cats = (b?.categories ?? [])
      .filter(c => !c.isDeferred)
      .map(({ name, tokens, color, kind }) => ({ name, tokens, color, kind }))
    const buffer = cats.find(c => c.kind === 'buffer')
    const next: Fill | null = b
      ? {
          cats,
          total: b.totalTokens,
          window: b.rawMaxTokens,
          pct: b.percentage,
          compactAt: buffer ? b.rawMaxTokens - buffer.tokens : null,
        }
      : null
    await update($, fill, () => next)
  } catch {
    // no usage before the session binds; the next turn.complete retries
  }
}

// the transcript is swapped a moment after a compaction is answered, and a /compact fires no turn.complete: read again a little
// later, twice, so the bar follows whoever compacted
function refreshSoon($: EngineInterface) {
  for (const ms of [500, 3000]) $.clock.after(ms, () => { void refresh($) })
}

// a slow poll as a net for what no event announces (a /clear, a resume, a compaction a host runs on its own)
const POLL_TICKS = 20
let tick = 0
let ticking = false

// /prime-ctbar auto [on | off | 1-99] sets the threshold; bare /prime-ctbar toggles the bar
const runCtbar = async ($: EngineInterface, e: { args: string }) => {
  const [word, value] = e.args.trim().toLowerCase().split(/\s+/)
  if (word === 'auto') {
    if (value === undefined || value === '') {
      const at = await read($, autoAt)
      return { text: at === null ? 'Auto compact off.' : `Auto compact at ${at}% of the window.` }
    }
    const next = value === 'off' ? null : value === 'on' ? AUTO_DEFAULT : Number(value)
    if (next !== null && !(Number.isInteger(next) && next >= 1 && next <= 99)) {
      return { text: 'Usage: /prime-ctbar auto [on | off | 1-99]' }
    }
    await update($, autoAt, () => next)
    return { text: next === null ? 'Auto compact off.' : `Auto compact at ${next}% of the window.` }
  }
  if (word === 'sound') {
    if (value === 'on' || value === 'off') await update($, isSoundOn, () => value === 'on')
    else if (value !== undefined && value !== '') return { text: 'Usage: /prime-ctbar sound [on | off]' }
    return { text: `Test sounds ${(await read($, isSoundOn)) ? 'on' : 'off'}.` }
  }
  if (word === 'color' || word === 'colour') {
    const want = (value ?? '').trim()
    if (want === '') return { text: `Button colour: ${await read($, btnColor)}. Change: /prime-ctbar color <name | #rrggbb | default>` }
    const next = want === 'default' ? BTN_DEFAULT : want
    if (!/^(?:#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(next)) return { text: 'Usage: /prime-ctbar color <name | #rrggbb | default>' }
    await update($, btnColor, () => next)
    return { text: `Button colour: ${next}.` }
  }
  if (word !== undefined && word !== '') return { text: 'Usage: /prime-ctbar [auto [on | off | 1-99] | color <name | #rrggbb | default> | sound [on | off]]' }
  const wasHidden = await read($, isHidden)
  await update($, isHidden, () => !wasHidden)
  if (wasHidden) await refresh($)
  return { text: wasHidden ? 'Context bar shown.' : 'Context bar hidden.' }
}

export const register: Register = on => {
  // /compact typed by the person, the threshold, or another plugin; this plugin's own button redraws in compact()
  on('session.compact', async ($, e, next) => {
    // observe only: the transcript goes down as it came
    try {
      return await next(e)
    } finally {
      refreshSoon($) // a failed compaction too: the window may have changed
    }
  })

  on('session.append', { door: 'compaction' }, async ($, e, next) => {
    refreshSoon($)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prime-ctbar',
      description: 'Show or hide the context window breakdown above the prompt (or /ctbar)',
    })
    for (const name of ['ctbar', 'context-bar']) {
      await $.command.register({ name, description: 'Alias of /prime-ctbar' }).catch(() => {}) // a name another command holds stays theirs
    }
    // a reload mid-animation leaves the face as it was, and press() only starts from 'compact'
    if (!compacting) {
      await update($, btnLabel, () => 'compact')
      await update($, debris, () => null)
    }
    await refresh($)
    if (ticking) return next(e) // a second session.start must not stack a second timer
    ticking = true
    $.clock.every(1000, async () => {
      if (++tick % POLL_TICKS === 0 && !(await read($, isHidden))) await refresh($)
      const end = await read($, endsAt)
      if (end === null) return
      const left = Math.max(0, Math.ceil((end - (await $.clock.now())) / 1000))
      await update($, cache, () => left)
      if (left === 0) await update($, endsAt, () => null) // cold: stop redrawing every second
    })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // a slash command may run no turn, and then no turn.complete would end the 'live'
    if (e.command) return next(e)
    await update($, endsAt, () => null)
    await update($, cache, () => 'live' as const)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const end = (await $.clock.now()) + TTL_MS
    await update($, endsAt, () => end)
    await update($, cache, () => TTL_MS / 1000)
    await refresh($)
    // not here: a compaction is refused while the turn that is completing still runs
    $.clock.after(RETRY_MS, () => { void maybeCompact($) })
    if (e.reason === 'error') void chime($, 'fail')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const { command, run_in_background } = e as { command?: unknown; run_in_background?: unknown }
    // a background run answers at once, before any test has finished
    if ((e.tool === 'Bash' || e.tool === 'PowerShell') && typeof command === 'string' && !run_in_background && !r.deny && TEST_CMD.test(command)) {
      void chime($, r.isError ? 'fail' : 'pass')
    }
    return r
  })


  on('command.run', { command: 'prime-ctbar' }, runCtbar)
  on('command.run', { command: 'ctbar' }, runCtbar)
  on('command.run', { command: 'context-bar' }, runCtbar)

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, fill)
    if (e.props.hasSurvey || f === null || (await read($, isHidden))) return next(e)

    const c = await read($, cache)
    const autoOn = await read($, autoAt)
    const label = await read($, btnLabel)
    const face = await read($, btnColor)
    const rubble = await read($, debris)
    const { Box, Button, Text } = $.ui.resolve(e)
    // the box the band draws into (narrower than the viewport beside a docked pane)
    const width = Math.max(24, (e.props.bodyColumns ?? 80) - 2)
    const sum = f.cats.reduce((a, k) => a + k.tokens, 0) || 1
    // ponytail: fixed 70/85 thresholds, make them options if they need tuning
    const tone = f.pct >= 85 ? 'red' : f.pct >= 70 ? 'yellow' : 'green'
    const cacheTone = c === 'live' || (c !== null && c > 60) ? 'green' : c === 0 ? 'red' : 'yellow'

    return (
      <Box flexDirection="column" width={width}>
        <Box width={width} flexWrap="wrap" justifyContent="space-between">
          <Box>
            <Text bold>◆ context</Text>
            {c !== null && (
              <Text color={cacheTone}>  ⏱ cache {c === 'live' ? 'live' : c === 0 ? 'cold' : mmss(c)}</Text>
            )}
          </Box>
          <Box>
            <Text bold>{fmt(f.total)}</Text>
            <Text dimColor> of {fmt(f.window)}</Text>
            {f.compactAt !== null && <Text dimColor> · compacts at {fmt(f.compactAt)} </Text>}
            {autoOn !== null && <Text dimColor>· auto {autoOn}% </Text>}
            <Text color={tone} inverse bold> {Math.round(f.pct)}% </Text>
            {/* a press runs in the plugin's own environment, so $ is the one drawing it */}
            <Button key="compact" onPress={() => { void press($, `Compacted at ${Math.round(f.pct)}%`) }}>
              <Text color={face} bold>{label}</Text>
            </Button>
          </Box>
        </Box>
        {/* colour blocks sized by flex, not by glyph count: a glyph's advance differs per surface */}
        <Box width={width} height={1} overflow="hidden" paddingLeft={rubble?.nudge ?? 0}>
          {f.cats
            .filter(k => k.tokens > 0)
            .map(k => {
              const grow = Math.max(1, Math.round((k.tokens / sum) * 1000))
              return rubble ? (
                <Box key={k.name} flexGrow={grow} minWidth={1} height={1} overflow="hidden">
                  <Text color={k.color} wrap="truncate">{rubble.glyphs.repeat(Math.ceil(width / rubble.glyphs.length))}</Text>
                </Box>
              ) : (
                <Box key={k.name} flexGrow={grow} minWidth={1} height={1} backgroundColor={k.color} />
              )
            })}
        </Box>
        <Box width={width} flexWrap="wrap">
          {f.cats.map(k => (
            <Box key={k.name} marginRight={2}>
              <Text color={k.color}>■ </Text>
              <Text dimColor>{SHORT[k.name.toLowerCase()] ?? k.name.toLowerCase()} </Text>
              <Text bold>{fmt(k.tokens)}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
