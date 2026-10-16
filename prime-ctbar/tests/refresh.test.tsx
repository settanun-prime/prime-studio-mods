import { expect, mock, test } from 'claude-code/testing'

let pct = 90
const usage = () => ({
  startedAt: 0,
  context: {
    tokens: pct * 10000,
    window: 1000000,
    percent: pct,
    breakdown: {
      categories: [{ name: 'Messages', tokens: pct * 10000, color: 'permission', isDeferred: false, kind: 'used' }],
      totalTokens: pct * 10000,
      maxTokens: 1000000,
      rawMaxTokens: 1000000,
      percentage: pct,
    },
  },
  rateLimits: [],
})

async function band($: any, on: any) {
  const clock = mock.clock(on)
  pct = 90
  on('ui.toast', () => ({ value: undefined }))
  on('session.usage', () => ({ value: usage() }))
  on('session.start', (_$: any, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'prime-ctbar',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  return { clock, ui }
}

test('the bar follows a compaction somebody else ran: no turn ends, still it redraws', async ($, on) => {
  on('session.compact', () => {
    pct = 10 // the window after the compaction
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  const { clock, ui } = await band($, on)
  expect(await ui.find({ type: 'Text', text: ' 90% ' })).toBeDefined()
  await $.session.compact({})
  await clock.advance(600)
  expect(await ui.find({ type: 'Text', text: ' 10% ' })).toBeDefined()
  await ui.unmount()
})

test('the bar follows the window with no event at all, on the slow poll', async ($, on) => {
  const { clock, ui } = await band($, on)
  pct = 20
  await clock.advance(21_000)
  expect(await ui.find({ type: 'Text', text: ' 20% ' })).toBeDefined()
  await ui.unmount()
})

test('a button press on a host that only runs /compact still redraws the bar', async ($, on) => {
  on('session.compact', () => { throw new Error('$.session.compact: not available in a headless (-p / SDK) session') })
  on('command.run', () => { pct = 12; return { text: 'compacted' } })
  const { clock, ui } = await band($, on)
  const pressed = $.ui.press({ plugin: 'prime-ctbar', key: 'compact' })
  await clock.advance(5000)
  await pressed
  expect(await ui.find({ type: 'Text', text: ' 12% ' })).toBeDefined()
  await ui.unmount()
})
