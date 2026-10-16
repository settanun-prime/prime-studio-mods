import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Fill } from '../types'

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
// the button's face: its label shrinks when pressed, spins while compacting, then grows back
const btnLabel = atom({ plugin: 'prime-ctbar', key: 'btnLabel' } as const, 'compact')
// the colour of its label; /prime-ctbar color <name | #hex | default> changes it
const btnColor = atom({ plugin: 'prime-ctbar', key: 'btnColor' } as const, '#7dd3fc')
const BTN_DEFAULT = '#7dd3fc'
const SQUEEZE = ['compact', 'compac', 'comp', 'co', '·']
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

// a host that cannot compact from a plugin (the desktop app and every SDK session: "$.session.compact: not available in a
// headless (-p / SDK) session") may still run its own /compact command; a plugin runs a command with $.command.run, not as a prompt
async function compactAsCommand($: EngineInterface) {
  await update($, headless, () => true)
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
    if (await read($, headless)) await compactAsCommand($)
    else {
      $.ui.toast('Compacting…')
      // a compaction that never answers must not leave the flag set and every later press silent
      const r = await Promise.race([
        $.session.compact({ instructions: COMPACT_KEEP }),
        new Promise<never>((_, no) => { $.clock.after(COMPACT_TIMEOUT_MS, () => no(new Error('no answer after 2 minutes'))) }),
      ])
      $.ui.toast(r.skip ? `Compact skipped: ${r.skip}` : why)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (attempt < RETRIES && /turn|running|busy|progress/i.test(reason)) again = true
    else {
      // not a busy turn: this host cannot do it from here. Say why, and ask the host's own /compact instead
      $.ui.toast(`Compact did not run: ${reason.slice(0, 80)}`)
      await compactAsCommand($)
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

// the press of the button: the label squeezes down to a dot, turns while the compaction works, then opens back out
async function press($: EngineInterface, why: string) {
  if (compacting || (await read($, btnLabel)) !== 'compact') return
  for (const frame of SQUEEZE) {
    await update($, btnLabel, () => frame)
    await $.clock.sleep(FRAME_MS)
  }
  const job = compact($, why)
  let i = 0
  while (compacting) {
    await update($, btnLabel, () => SPIN[i++ % SPIN.length])
    await $.clock.sleep(120)
  }
  await job
  for (const frame of [...SQUEEZE].reverse()) {
    await update($, btnLabel, () => frame)
    await $.clock.sleep(FRAME_MS)
  }
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
  if (word === 'color' || word === 'colour') {
    const want = (value ?? '').trim()
    if (want === '') return { text: `Button colour: ${await read($, btnColor)}. Change: /prime-ctbar color <name | #rrggbb | default>` }
    const next = want === 'default' ? BTN_DEFAULT : want
    if (!/^(?:#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(next)) return { text: 'Usage: /prime-ctbar color <name | #rrggbb | default>' }
    await update($, btnColor, () => next)
    return { text: `Button colour: ${next}.` }
  }
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
    return next(e)
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
        <Box width={width} height={1} overflow="hidden">
          {f.cats
            .filter(k => k.tokens > 0)
            .map(k => (
              <Box key={k.name} flexGrow={Math.max(1, Math.round((k.tokens / sum) * 1000))} minWidth={1} height={1} backgroundColor={k.color} />
            ))}
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
