import { expect, mock, test } from 'claude-code/testing'

// which clip played: on Windows through PowerShell's SoundPlayer, elsewhere through $.audio.play
function listen(on: any) {
  const played: string[] = []
  const clock = mock.clock(on)
  on('process.run', (_$: any, e: { argv: string[] }) => {
    const m = /sfx\/(\w+)\.wav/.exec(e.argv.join(' '))
    if (m) played.push(m[1])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('audio.play', (_$: any, e: { clip: { asset?: string } }) => {
    const m = /sfx\/(\w+)\.wav/.exec(e.clip.asset ?? '')
    if (m) played.push(m[1])
    return { value: undefined }
  })
  // past the one-chime-a-second guard, and let the unawaited chime finish
  const settle = async () => { await clock.advance(2000); await new Promise(r => setTimeout(r, 20)) }
  return { played, settle }
}

test('a passing test run plays the jingle, a failing one the buzz, a background one nothing', async ($, on) => {
  const { played, settle } = listen(on)
  let fails = false
  on('tool.call', () => (fails ? { isError: true, result: 'Exit code 1', text: 'Exit code 1' } : { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as any)
  await settle()
  expect(played).toEqual(['pass'])

  fails = true
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as any)
  await settle()
  expect(played).toEqual(['pass', 'fail'])

  await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true } as any)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  await settle()
  expect(played).toEqual(['pass', 'fail'])
})

test('a turn that ends in an error plays the buzz; /prime-ctbar sound off silences it', async ($, on) => {
  const { played, settle } = listen(on)
  on('turn.complete', (_$: any, e: { answer?: string }) => ({ text: e.answer ?? '' }))
  on('session.usage', () => { throw new Error('no session') })
  await $.turn.complete({ reason: 'error', answer: '', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  await settle()
  expect(played).toEqual(['fail'])

  const r = await $.command.run({ command: 'prime-ctbar', args: 'sound off' })
  expect(r.text).toBe('Test sounds off.')
  await $.turn.complete({ reason: 'error', answer: '', durationMs: 1, isAborted: false, turnId: 't2' } as any)
  await settle()
  expect(played).toEqual(['fail'])
})
