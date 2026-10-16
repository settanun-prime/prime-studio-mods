// What a tool call may touch while the guard is on. detect.ts hides personal data in what the model READS;
// this is the other half — keeping the secret files out of reach, and keeping credentials and personal data
// from leaving the machine through a tool (a fetch, a curl, an MCP call). Best effort: patterns, not a sandbox.
import { findSensitive } from './detect'

// the files that hold a secret by their name. `.env.example` and its kin hold placeholders and are fine.
const TEMPLATE = /\.(?:example|sample|template|dist|defaults?)$/i
const SECRET_FILE =
  /(?:^|[\\/])(?:\.env(?:\.[\w.-]+)?|\.npmrc|\.netrc|\.pgpass|\.git-credentials|id_(?:rsa|dsa|ecdsa|ed25519)|credentials(?:\.json)?|secrets?\.(?:json|ya?ml|toml|env)|service[-_]account[\w.-]*\.json|[\w.-]+\.(?:pem|key|p12|pfx|jks|keystore|kdbx|ppk))$/i

export const secretFile = (path: string) => {
  const p = path.trim().replace(/^["']|["']$/g, '')
  return p !== '' && SECRET_FILE.test(p) && !TEMPLATE.test(p)
}

// every word of a shell command (quoted or not)
const words = (cmd: string) => cmd.split(/[\s;|&<>()"'`]+/).filter(Boolean)

// a command that prints, copies or sends a file's content (as opposed to merely running a program)
const READS =
  /(?:^|[\s;|&(])(?:cat|type|more|less|head|tail|nl|tac|sed|awk|grep|egrep|fgrep|rg|findstr|strings|xxd|od|base64|cp|copy|mv|scp|sftp|rsync|curl|wget|source|gc|Get-Content|Select-String|Out-String|Invoke-WebRequest|Invoke-RestMethod|iwr|irm)(?:\s|$)|(?:^|\s)\.\s+\S/i

// printing a variable that holds a credential, or the whole environment
const ENV_DUMP =
  /(?:^|[\s;|&(])(?:printenv|env|set|export\s+-p|Get-ChildItem\s+Env:|gci\s+env:|ls\s+env:)(?:\s*$|\s*[|;&>])|(?:echo|printf|Write-Host|Write-Output)\b[^|;&\n]*(?:\$\{?|\$env:)[A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE|DATABASE_URL|CREDENTIAL)/i

// commands and tools that send data off the machine
// only where a command starts (after ; | & ( or a newline, past sudo/xargs/time and VAR=x), so the word "SSH" in a
// message or a README line is not taken for the ssh program
const AT_COMMAND = String.raw`(?:^|[;|&(\n])[ \t]*(?:(?:sudo|xargs|time|nohup)[ \t]+|[A-Za-z_]\w*=\S*[ \t]+)*`
export const EGRESS_COMMAND = new RegExp(
  `${AT_COMMAND}(?:curl|wget|nc|ncat|netcat|scp|sftp|ftp|rsync|ssh|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|gh[ \\t]+(?:api|gist|repo|release|pr|issue)|git[ \\t]+(?:-C[ \\t]+\\S+[ \\t]+)?(?:push|send-email))(?:[ \\t]|$)`,
  'i',
)
// what puts files or text on a public service: these get the deeper scan of what they would publish
export const PUBLISH = new RegExp(
  `${AT_COMMAND}(?:git[ \\t]+(?:-C[ \\t]+\\S+[ \\t]+)?(?:push|send-email)|gh[ \\t]+(?:repo[ \\t]+(?:create|sync|fork)|release[ \\t]+(?:create|upload|edit)|pr[ \\t]+(?:create|edit|comment)|issue[ \\t]+(?:create|comment|edit)|gist[ \\t]+create)|(?:npm|pnpm|yarn|bun)[ \\t]+publish|docker[ \\t]+push|vsce[ \\t]+publish|cargo[ \\t]+publish|twine[ \\t]+upload)(?:[ \\t]|$)`,
  'i',
)
const EGRESS_TOOL = /^(?:WebFetch|WebSearch|mcp__.*)$/

// a test runner where a command starts (after ; | & ( or a newline, past npx, timeout, VAR=x and the like), not the word in a grep;
// the guard chimes when one ends. The same pattern is in prime-ctbar: a mod cannot import another's code
export const TEST_CMD =
  /(?:^|[;&|(\n])\s*(?:(?:npx|bunx|sudo|time|uv\s+run|poetry\s+run|pnpm\s+exec)\s+|timeout\s+\S+\s+|[A-Za-z_]\w*=\S*\s+)*(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|(?:jest|vitest|mocha|pytest|phpunit|rspec|ctest|playwright\s+test)\b|python3?\s+-m\s+(?:pytest|unittest)\b|(?:go|cargo|dotnet|deno)\s+test\b|cargo\s+nextest\b|(?:\.\/)?gradlew?\s+test\b|mvn\b[^\n;&|]*\btest\b|make\s+(?:test|check)\b|claude\s+plugin\s+test\b|(?:node|bash|sh|python3?|tsx|bun)\s+(?:--test\b|[\w./\\-]*test[\w./\\-]*\.(?:sh|mjs|cjs|js|ts|py)\b)|\.?\.?\/?[\w./\\-]*test[\w./\\-]*\.sh\b)/i

const PATH_TOOLS = /^(?:Read|NotebookRead|Grep|Glob|LS|NotebookEdit)$/

export type Verdict = { reason: string } | null

const strings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) strings(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out)
  return out
}

/** Whether a tool call may go ahead. `e` is the tool.call event: `tool` and the tool's own arguments beside it. */
export function toolGuard(e: { tool: string } & Record<string, unknown>): Verdict {
  const tool = String(e.tool)
  const args = strings({ ...e, tool: undefined })

  // 1. the tools that open files by path: never a secret file
  if (PATH_TOOLS.test(tool)) {
    const hit = args.find(secretFile)
    if (hit) return { reason: `PDPA guard: ${tool} is not allowed to open a secret file (${hit}). Ask the user for the one value you need, or have them run /pdpa-guard off.` }
  }

  // 2. a shell command: no printing or copying a secret file, no dumping the environment
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = typeof e.command === 'string' ? e.command : args.join(' ')
    const names = words(cmd).filter(secretFile)
    if (names.length > 0 && READS.test(cmd)) {
      return { reason: `PDPA guard: this command would read a secret file (${names[0]}) into the conversation. Use the value from the program that needs it, not a copy of the file.` }
    }
    if (ENV_DUMP.test(cmd)) {
      return { reason: 'PDPA guard: this command would print the environment or a credential variable. Read the one non-secret value you need instead.' }
    }
    // 3. a command that sends data away must not carry a credential or personal data
    if (EGRESS_COMMAND.test(cmd) && findSensitive(cmd).length > 0) {
      return { reason: 'PDPA guard: this command sends data off the machine and it contains a credential or personal data. Remove it from the command.' }
    }
    return null
  }

  // 3. a network tool must not carry a credential or personal data either
  if (EGRESS_TOOL.test(tool) && args.some(a => findSensitive(a).length > 0)) {
    return { reason: `PDPA guard: ${tool} would send a credential or personal data out. Remove it from the call.` }
  }
  return null
}
