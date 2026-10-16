import { expect, mock, test } from 'claude-code/testing'

const usage = (pct: number) => ({
  startedAt: 0,
  context: {
    tokens: pct * 10000,
    window: 1000000,
    percent: pct,
    breakdown: {
      categories: [
        { name: 'Messages', tokens: pct * 10000, color: 'permission', isDeferred: false, kind: 'used' },
        { name: 'Autocompact buffer', tokens: 33000, color: 'inactive', isDeferred: false, kind: 'buffer' },
      ],
      totalTokens: pct * 10000,
      maxTokens: 1000000,
      rawMaxTokens: 1000000,
      percentage: pct,
    },
  },
  rateLimits: [],
})

// a turn.complete that has just ended a turn at 90% of the window
async function endTurnAt90($: any, on: any) {
  const clock = mock.clock(on)
  const toasts: string[] = []
  on('ui.toast', (_$: any, e: { text: string }) => { toasts.push(e.text); return { value: undefined } })
  on('session.usage', () => ({ value: usage(90) }))
  on('session.start', (_$: any, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  on('turn.complete', (_$: any, e: { answer: string }) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' })
  return { clock, toasts }
}

test('auto compact is not asked inside the turn that is completing; it is asked after, and says why when it fails', async ($, on) => {
  let asked = 0
  on('session.compact', () => {
    asked += 1
    throw new Error('the engine said no')
  })
  const ran: string[] = []
  on('command.run', (_$: any, e: { command: string }) => { ran.push(e.command); return { text: 'compacted' } })
  const { clock, toasts } = await endTurnAt90($, on)
  expect(asked).toBe(0) // not inside turn.complete
  await clock.advance(2000)
  expect(asked).toBeGreaterThan(0) // after the turn, on the timer
  const failed = toasts.find((t) => t.startsWith('Compact did not run: '))
  expect(failed).toBeDefined() // and a reason follows, not just "did not run"
  expect((failed ?? '').length).toBeGreaterThan('Compact did not run: '.length)
  // a host that cannot compact from a plugin still runs its own /compact command
  expect(ran).toContain('compact')
})

test('auto compact goes through when the turn is over', async ($, on) => {
  let asked = 0
  on('session.compact', () => {
    asked += 1
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  const { clock, toasts } = await endTurnAt90($, on)
  expect(asked).toBe(0)
  await clock.advance(2000)
  expect(asked).toBe(1)
  expect(toasts.some((t) => t.startsWith('Auto compact at 90%'))).toBe(true)
})
