export type Agent = {
  name: string
  source: string
  model: string | null
  description: string
  tokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'prime-agents-panel': { agents: Agent[] }
  }
}
