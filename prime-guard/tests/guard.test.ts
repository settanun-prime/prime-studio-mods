import { expect, test } from 'claude-code/testing'

const PHONE = ['081', '234', '5678'].join('-')
const TAGGED = new RegExp(`\\[${['RE', 'DACTED'].join('')}:PHONE_1~[a-z0-9]+\\]`)

test('a prompt reaches the engine redacted, with this session suffix', async ($, on) => {
  let entered = ''
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('prompt.submit', (_$, e) => {
    entered = e.text
    return { ...e }
  })
  await $.prompt.submit({ text: `call ${PHONE} now`, wait: false, origin: { kind: 'composer' } })
  expect(entered).toMatch(TAGGED)
  expect(entered).not.toContain(PHONE)
})

test('a prompt holding a credential never reaches the engine, in the default redact mode', async ($, on) => {
  let reached = false
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('prompt.submit', (_$, e) => {
    reached = true
    return { ...e }
  })
  const key = ['sk-', 'abcdefghijklmnopqrstuvwx'].join('')
  await $.prompt.submit({ text: `use ${key} here`, wait: false, origin: { kind: 'composer' } })
  expect(reached).toBe(false)
})
