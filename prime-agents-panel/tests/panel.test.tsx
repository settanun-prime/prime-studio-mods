import { expect, test } from 'claude-code/testing'

test('session.start registers prime-agents-panel command', async ($, on) => {
  let registered = ''
  on('session.start', (_$$, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$, e: any) => {
    registered = e.name
    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(registered).toBe('prime-agents-panel')
})

test('prime-agents-panel command toggles open and close sequentially', async ($, on) => {
  const actions: string[] = []

  on('session.start', (_$$, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', (_$, e: any) => {
    actions.push(`open:${e.id}`)
    return { value: undefined }
  })
  on('ui.close', (_$, e: any) => {
    actions.push(`close:${e.id}`)
    return { value: undefined }
  })
  on('fs.list', () => ({ value: [] }))
  on('session.usage', () => ({ value: { context: { breakdown: { agents: [] } } } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  // 1st run: opens panel
  const res1 = await $.command.run({ command: 'prime-agents-panel', args: [] })
  expect(res1.text).toBe('Agents panel open.')

  // 2nd run: closes panel
  const res2 = await $.command.run({ command: 'prime-agents-panel', args: [] })
  expect(res2.text).toBe('Agents panel closed.')

  // 3rd run: re-opens panel
  const res3 = await $.command.run({ command: 'prime-agents-panel', args: [] })
  expect(res3.text).toBe('Agents panel open.')

  expect(actions).toEqual([
    'open:prime-agents-panel',
    'close:prime-agents-panel',
    'open:prime-agents-panel',
  ])
})

test('panel renders empty state when no custom agents exist', async ($, on) => {
  on('session.start', (_$$, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }))
  on('session.usage', () => ({ value: { context: { breakdown: { agents: [] } } } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prime-agents-panel', args: [] })

  const ui = await $.ui.mount({
    plugin: 'prime-agents-panel',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'prime-agents-panel',
    props: {},
  })

  const textNodes = await ui.findAll({ type: 'Text' })
  const texts = textNodes.map((n: any) => n.text).join(' ')
  expect(texts).toMatch(/0 defined/)
  expect(texts).toMatch(/No custom agents/)

  await ui.unmount()
})

test('panel renders categorized agents from fs and session.usage', async ($, on) => {
  on('session.start', (_$$, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: undefined }))
  on('fs.list', () => ({
    value: [
      { name: 'architect.md', kind: 'file' },
      { name: 'ignored.txt', kind: 'file' },
    ],
  }))
  on('fs.read', () => ({
    value: '---\nname: architect\nmodel: claude-opus-5-5\ndescription: System architect\n---\nBody',
  }))
  on('session.usage', () => ({
    value: {
      context: {
        breakdown: {
          agents: [
            { agentType: 'general-assistant', source: 'userSettings', tokens: 1200 },
            { agentType: 'formatter', source: 'plugin', tokens: 450 },
          ],
        },
      },
    },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prime-agents-panel', args: [] })

  const ui = await $.ui.mount({
    plugin: 'prime-agents-panel',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'prime-agents-panel',
    props: {},
  })

  const textNodes = await ui.findAll({ type: 'Text' })
  const allText = textNodes.map((n: any) => n.text).join(' ')

  expect(allText).toMatch(/3 defined/)
  expect(allText).toMatch(/architect/)
  expect(allText).toMatch(/System architect/)
  expect(allText).toMatch(/general-assistant/)
  expect(allText).toMatch(/formatter/)

  await ui.unmount()
})

test('pressing run button spawns agent and displays toast', async ($, on) => {
  let spawned: any = null
  let toastMsg = ''

  on('session.start', (_$$, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.toast', (_$, e: any) => {
    toastMsg = e.text
    return { value: undefined }
  })
  on('agent.spawn', (_$, e: any) => {
    spawned = e
    return { model: 'claude-3-5-sonnet' }
  })
  on('fs.list', () => ({ value: [{ name: 'tester.md', kind: 'file' }] }))
  on('fs.read', () => ({ value: '---\nname: tester\ndescription: Test runner\n---\nBody' }))
  on('session.usage', () => ({ value: { context: { breakdown: { agents: [] } } } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prime-agents-panel', args: [] })

  const ui = await $.ui.mount({
    plugin: 'prime-agents-panel',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'prime-agents-panel',
    props: {},
  })

  await $.ui.press({ plugin: 'prime-agents-panel', key: 'run-tester' })

  expect(spawned).toBeDefined()
  expect(spawned.subagent_type).toBe('tester')
  expect(toastMsg).toBe('tester started')

  await ui.unmount()
})

test('pressing run button handles denial gracefully', async ($, on) => {
  let toastMsg = ''

  on('session.start', (_$$, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.toast', (_$, e: any) => {
    toastMsg = e.text
    return { value: undefined }
  })
  on('agent.spawn', () => ({ deny: 'permission denied by policy' }))
  on('fs.list', () => ({ value: [{ name: 'restricted.md', kind: 'file' }] }))
  on('fs.read', () => ({ value: '---\nname: restricted\ndescription: Restricted agent\n---\nBody' }))
  on('session.usage', () => ({ value: { context: { breakdown: { agents: [] } } } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prime-agents-panel', args: [] })

  const ui = await $.ui.mount({
    plugin: 'prime-agents-panel',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'prime-agents-panel',
    props: {},
  })

  await $.ui.press({ plugin: 'prime-agents-panel', key: 'run-restricted' })
  expect(toastMsg).toBe('restricted: permission denied by policy')

  await ui.unmount()
})
