import { expect, mock, test } from 'claude-code/testing'

import { TEST_CMD } from '../hooks/guard'

test('a test runner is told from a command that only names one', () => {
  for (const cmd of ['npm test', 'cd app && pytest -q', 'claude plugin test prime-ctbar', 'node prime-workflow/tests/unit.test.mjs', 'CI=1 npx vitest run', 'go test ./...', 'bun run test'])
    expect(TEST_CMD.test(cmd)).toBe(true)
  for (const cmd of ['grep jest package.json', 'cat pytest.ini', 'git commit -m "fix npm test"', 'ls tests', 'echo go test'])
    expect(TEST_CMD.test(cmd)).toBe(false)
})

test('the guard chimes on a test run and buzzes when it refuses a call; /prime-guard sound off silences it', async ($, on) => {
  const clock = mock.clock(on)
  const played: string[] = []
  const grab = (s: string) => {
    const m = /sfx\/(\w+)\.wav/.exec(s)
    if (m) played.push(m[1])
  }
  on('process.run', (_$: any, e: { argv: string[] }) => {
    grab(e.argv.join(' '))
    return { value: { exitCode: 1, stdout: '', stderr: '' } }
  })
  on('audio.play', (_$: any, e: { clip: { asset?: string } }) => {
    grab(e.clip.asset ?? '')
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))
  // past the one-chime-a-second guard, and let the unawaited chime finish
  const settle = async () => {
    await clock.advance(2000)
    await new Promise(r => setTimeout(r, 20))
  }

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as any)
  await settle()
  expect(played).toEqual(['pass'])

  await $.tool.call({ tool: 'Read', file_path: ['/app/', '.', 'env'].join('') } as any)
  await settle()
  expect(played).toEqual(['pass', 'fail'])

  await $.command.run({ command: 'prime-guard', args: 'sound off' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as any)
  await settle()
  expect(played).toEqual(['pass', 'fail'])
})
