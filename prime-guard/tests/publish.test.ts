import { expect, test } from 'claude-code/testing'

import { EGRESS_COMMAND, PUBLISH, toolGuard } from '../hooks/guard'
import { setIdentity } from '../hooks/detect'
import { scanPublish } from '../hooks/publish'

setIdentity({ users: [], hosts: [] })

test('a publish command is recognised where a command starts, not in prose', () => {
  for (const c of ['git push origin main', 'git -C D:/x push --force', 'cd /d/proj && git push', 'FOO=1 git push', 'gh repo create x --public --push', 'gh release create v1', 'npm publish', 'docker push img:1'])
    expect(PUBLISH.test(c)).toBe(true)
  for (const c of ['git status', 'git commit -m "push the SSH setup"', 'echo git push', 'git log --oneline', 'npm run build'])
    expect(PUBLISH.test(c)).toBe(false)
})

test('the word ssh in a message is not the ssh program, but ssh at a command start is', () => {
  expect(EGRESS_COMMAND.test('git commit -m "key-only SSH for the LAN"')).toBe(false)
  expect(EGRESS_COMMAND.test('echo SSH is on')).toBe(false)
  expect(EGRESS_COMMAND.test('ssh box hostname')).toBe(true)
  expect(EGRESS_COMMAND.test('cd x && curl -s localhost')).toBe(true)
  expect(EGRESS_COMMAND.test('sudo scp a b:c')).toBe(true)
  expect(EGRESS_COMMAND.test('HTTPS_PROXY=x curl https://a')).toBe(true)
})

test('a command that sends data out may not carry a name or a machine', () => {
  expect(toolGuard({ tool: 'Bash', command: 'ssh frank@devbox hostname' })).not.toBeNull()
  expect(toolGuard({ tool: 'Bash', command: 'git push origin main' })).toBeNull()
  expect(toolGuard({ tool: 'Bash', command: 'git commit -m "SSH setup for the LAN"' })).toBeNull()
})

test('a push scans what the new commits add, not the pusher own author line', async () => {

  const asked: string[][] = []
  const mail = ['somchai', '@', 'mail.test'].join('')
  const exec = async (argv: string[]) => {
    asked.push(argv)
    if (argv[1] === 'log') {
      // what git prints for the format the scan asks for; an author line would only appear if the format named one
      const author = argv.some(a => a.includes('%ae')) ? `Somchai <${mail}>\n` : ''
      return { exitCode: 0, stdout: `\u0001commit\n${author}fix typo\n\ndiff --git a/x b/x\n+++ b/x\n+hello\n` }
    }
    return { exitCode: argv.includes('@{u}') ? 1 : 0, stdout: '/repo' }
  }
  expect(await scanPublish(exec, 'git push -u origin feature')).toBe(null)
  // a new branch: only what no remote branch has yet
  expect(asked.find(a => a[1] === 'log')).toEqual(expect.arrayContaining(['HEAD', '--not', '--remotes']))
})
