import { expect, test } from 'claude-code/testing'

import { findSensitive, secretCount } from '../hooks/detect'

// samples are made up: assembled from fragments so no real credential sits in the source
const j = (...p: string[]) => p.join('')
const OPENAI = j('sk-', 'abcdefghijklmnopqrstuvwx')
const STRIPE = j('sk_', 'live_', '0123456789abcdefABCD')
const GOOGLE = j('AIza', '0123456789abcdefghijklmnopqrstuvwxy')
const PEM = j('-----BEGIN RSA ', 'PRIVATE KEY-----')
const DB_URL = j('postgres://app:', 'hunter2pw@db.example.test:5432/app')

test('every credential shape counts as a secret', () => {
  for (const s of [OPENAI, STRIPE, GOOGLE, PEM, DB_URL]) expect(secretCount(`use ${s} now`)).toBe(1)
})

test('ordinary text and a bare URL are not secrets', () => {
  expect(secretCount('see https://example.test/docs and sk-short')).toBe(0)
  expect(findSensitive('postgres://db.example.test:5432/app')).toEqual([])
})

test('a secret is kept out of redaction spans too, so scrub hides it from the model', () => {
  const kinds = findSensitive(`key ${OPENAI}`).map(([, , k]) => k)
  expect(kinds).toEqual(['SECRET'])
})
