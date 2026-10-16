import { expect, mock, test } from 'claude-code/testing'

const cats = [
  { name: 'Messages', tokens: 84000, color: 'permission', isDeferred: false, kind: 'used' },
  { name: 'Free space', tokens: 811000, color: 'promptBorder', isDeferred: false, kind: 'free' },
]

test('pressing the button squeezes the label, compacts once, and opens the label back out', async ($, on) => {
  const clock = mock.clock(on)
  let asked = 0
  const toasts: string[] = []
  on('ui.toast', (_$: any, e: { text: string }) => { toasts.push(e.text); return { value: undefined } })
  on('session.usage', () => ({ value: {
    startedAt: 0,
    context: { tokens: 90000, window: 1000000, percent: 9, breakdown: { categories: cats, totalTokens: 90000, maxTokens: 1000000, rawMaxTokens: 1000000, percentage: 9 } },
    rateLimits: [],
  } }))
  on('session.compact', () => {
    asked += 1
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  on('session.start', ($$: any, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'prime-ctbar',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: 'compact' })).toBeDefined()

  const pressed = $.ui.press({ plugin: 'prime-ctbar', key: 'compact' })
  await clock.advance(130) // two frames of the squeeze
  expect(await ui.find({ type: 'Text', text: 'compact' })).toBeUndefined() // the label has cracked
  expect(await ui.find({ type: 'Text', text: '▓█▓▒'.repeat(25) })).toBeDefined() // and the bar is rubble
  await clock.advance(5000)
  await pressed
  expect(asked).toBe(1)
  expect(await ui.find({ type: 'Text', text: 'compact' })).toBeDefined() // and is back
  await ui.unmount()
})
