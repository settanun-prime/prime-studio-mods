#!/usr/bin/env node
import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

function playSound(type) {
  if (process.env.CI || process.env.PRIME_TEST_SILENT === '1') return
  try {
    process.stdout.write('\x07')
    const wavPath = resolve(rootDir, 'prime-ctbar', 'sfx', `${type}.wav`)
    if (process.platform === 'win32' && existsSync(wavPath)) {
      spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${wavPath.replace(/'/g, "''")}').PlaySync()`], { stdio: 'ignore', detached: true }).unref()
    } else if (process.platform === 'darwin') {
      const sound = type === 'pass' ? '/System/Library/Sounds/Glass.aiff' : '/System/Library/Sounds/Basso.aiff'
      spawn('afplay', [sound], { stdio: 'ignore', detached: true }).unref()
    } else {
      const sound = type === 'pass' ? '/usr/share/sounds/freedesktop/stereo/complete.oga' : '/usr/share/sounds/freedesktop/stereo/dialog-error.oga'
      spawn('sh', ['-c', `paplay "${sound}" 2>/dev/null || aplay "${sound}" 2>/dev/null || true`], { stdio: 'ignore', detached: true }).unref()
    }
  } catch {}
}

function resolveClaudeBin() {
  if (process.platform === 'win32') {
    const roaming = resolve(process.env.APPDATA || '', 'npm', 'claude.cmd')
    if (existsSync(roaming)) return `"${roaming}"`
    return 'claude.cmd'
  }
  return 'claude'
}
const claudeBin = resolveClaudeBin()
const target = process.argv[2]
const commands = []

if (!target || target === 'all') {
  commands.push([claudeBin, ['plugin', 'test', 'prime-guard']])
  commands.push([claudeBin, ['plugin', 'test', 'prime-ctbar']])
  commands.push([claudeBin, ['plugin', 'test', 'prime-agents-panel']])
  commands.push(['node', ['prime-workflow/tests/unit.test.mjs']])
} else if (target === 'prime-workflow' || target === 'workflow') {
  commands.push(['node', ['prime-workflow/tests/unit.test.mjs']])
} else {
  commands.push([claudeBin, ['plugin', 'test', target]])
}

async function runCommand(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: rootDir, stdio: 'inherit', shell: true })
    p.on('close', (code) => resolve(code === 0))
    p.on('error', () => resolve(false))
  })
}

async function main() {
  console.log(`\x1b[36m▶ Running Prime Studio test suite (${target || 'all'})...\x1b[0m\n`)
  let allPassed = true
  for (const [cmd, args] of commands) {
    const ok = await runCommand(cmd, args)
    if (!ok) {
      allPassed = false
      break
    }
  }

  if (allPassed) {
    console.log(`\n\x1b[32m✔ All tests passed successfully! 🎮 (8-bit chime)\x1b[0m`)
    playSound('pass')
    process.exit(0)
  } else {
    console.log(`\n\x1b[31m✘ Test run failed or error occurred! ⚠️ (Alert chime)\x1b[0m`)
    playSound('fail')
    process.exit(1)
  }
}

main()
