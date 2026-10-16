declare module 'claude-code' {
  interface PluginState {
    'prime-guard': { isBlurOn: boolean; isRecording: boolean; guardMode: 'redact' | 'block' | 'off'; tagSuffix: string; isSoundOn: boolean }
  }
}
