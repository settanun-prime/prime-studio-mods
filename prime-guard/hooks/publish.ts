// What a publish command would put on a public service. guard.ts reads the command line; this reads the
// commits behind it: the files, the messages and the author lines. Values are never repeated in the
// reason, only which kind turned up and in which file. Best effort, like the rest.
import { findSensitive, type Kind } from './detect'

// the engine's `$` cannot cross an import, so the caller hands in a function that runs a command
export type Run = (argv: string[], cwd?: string) => Promise<{ exitCode: number; stdout: string; isStdoutTruncated?: boolean }>

// `cd dir && git push` and `git -C dir push` decide where git looks; Git Bash writes C:\x as /c/x
function workdir(cmd: string): string | undefined {
  const m = /^\s*cd\s+(?:\/d\s+)?("[^"]+"|'[^']+'|[^\s;&|]+)\s*(?:&&|;)/.exec(cmd) ?? /\bgit[ \t]+-C[ \t]+("[^"]+"|'[^']+'|\S+)/.exec(cmd)
  if (!m) return undefined
  const p = m[1].replace(/^["']|["']$/g, '')
  const msys = /^\/([A-Za-z])\/(.*)$/.exec(p)
  return msys ? `${msys[1].toUpperCase()}:/${msys[2]}` : p
}

const WORDS: Partial<Record<Kind, string>> = { SECRET: 'credential', KEY: 'key', USERNAME: 'user name', HOST: 'host name', MAC: 'MAC address', IP: 'IP address', NAME: 'name', EMAIL: 'email' }
const word = (k: Kind) => WORDS[k] ?? k.toLowerCase().replace('_', ' ')

/** A reason to refuse the command, or null when it is fine (or cannot be checked here: no repository). */
export async function scanPublish(exec: Run, cmd: string): Promise<string | null> {
  const cwd = workdir(cmd)
  const run = (argv: string[]) => exec(argv, cwd)

  let top
  try {
    top = await run(['git', 'rev-parse', '--show-toplevel'])
  } catch {
    return null // not a repository, or no way to run git here: only the command line is checked
  }
  if (top.exitCode !== 0) return null

  // only the commits that are not on the remote yet: past the upstream, or past every remote branch for a new branch
  const up = await run(['git', 'rev-parse', '--verify', '--quiet', '@{u}'])
  const range = up.exitCode === 0 ? ['@{u}..HEAD'] : ['HEAD', '--not', '--remotes']
  // not the author and committer lines: they are the person pushing, whose name and email every commit carries by design,
  // and scanning them refused every push
  const log = await run(['git', 'log', '-p', '--no-color', '--no-ext-diff', '--format=%x01commit%n%B', ...range])
  if (log.exitCode !== 0) return null

  const text = log.stdout
  // What a push publishes is what the commits ADD (a line a commit removes, or only shows as context, was public
  // before it or is added by an earlier commit in the range) plus each commit's own message and author lines.
  // So inside a diff only `+` lines are kept; the `+` itself is blanked, because it would hide a config line from
  // the rules that read from the start of a line (`User x`, `HostName y`, `Author: z`). Every other character is
  // swapped for a space of the same width, so each offset stays where it was.
  let inDiff = false
  const kept = text.split('\n').map(line => {
    if (line.startsWith('\u0001commit')) inDiff = false
    else if (line.startsWith('diff --git')) inDiff = true
    if (!inDiff) return line
    return line.startsWith('+') && !line.startsWith('+++') ? ' ' + line.slice(1) : ' '.repeat(line.length)
  })
  const spans = findSensitive(kept.join('\n'))
  if (spans.length === 0) return null

  // the file of a hit is the nearest `+++ b/<path>` header before it; before any header it is a commit's own text
  const heads: [number, string][] = []
  for (const m of text.matchAll(/^\+\+\+ b\/(.+)$/gm)) heads.push([m.index, m[1]])
  const where = new Map<string, Map<Kind, number>>()
  let h = -1
  for (const [s, , kind] of spans) {
    while (h + 1 < heads.length && heads[h + 1][0] < s) h++
    const lastCommit = text.lastIndexOf('\u0001commit', s)
    const file = h >= 0 && heads[h][0] > lastCommit ? heads[h][1] : 'commit message or author line'
    const kinds = where.get(file) ?? new Map<Kind, number>()
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    where.set(file, kinds)
  }
  const list = [...where].slice(0, 8).map(([file, kinds]) => `${file} (${[...kinds].map(([k, n]) => `${n} ${word(k)}`).join(', ')})`)
  const more = where.size > 8 ? `, and ${where.size - 8} more` : ''
  const cut = log.isStdoutTruncated ? ' Only the first 4 MiB of history was read.' : ''
  return `PDPA guard: this would publish personal data or secrets, found in: ${list.join('; ')}${more}.${cut} Take them out of the files and rewrite the commits that hold them, or have the user run /pdpa-guard off.`
}
