import { expect, test } from 'claude-code/testing'

import { hooksDir, isGuardHooks, repoint } from '../hooks/githooks'

test('the hooks folder sits in the plugin root, with forward slashes', () => {
  expect(hooksDir('C:\\plugins\\cache\\prime-studio-mods\\prime-guard\\1.2.0')).toBe('C:/plugins/cache/prime-studio-mods/prime-guard/1.2.0/git-hooks')
})

test('a prime-guard hooks folder is recognised in a version folder or a checkout, nothing else', () => {
  expect(isGuardHooks('C:/plugins/cache/prime-studio-mods/prime-guard/1.1.9/git-hooks')).toBe(true)
  expect(isGuardHooks('D:\\work\\prime-studio-mods\\prime-guard\\git-hooks\\')).toBe(true)
  for (const p of ['', '.husky', 'C:/tools/git-hooks', 'C:/x/prime-guard-old/git-hooks']) expect(isGuardHooks(p)).toBe(false)
})

test('after an update an older prime-guard path moves to this copy; a foreign or current path stays', () => {
  const ours = 'C:/plugins/cache/prime-studio-mods/prime-guard/1.2.0/git-hooks'
  expect(repoint('C:/plugins/cache/prime-studio-mods/prime-guard/1.1.9/git-hooks', ours)).toBe(ours)
  expect(repoint('C:\\plugins\\cache\\prime-studio-mods\\prime-guard\\1.2.0\\git-hooks', ours)).toBeNull()
  expect(repoint('.husky', ours)).toBeNull()
  expect(repoint('', ours)).toBeNull()
})
