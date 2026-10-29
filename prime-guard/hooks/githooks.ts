// git-hooks/ is a global git hooks folder (core.hooksPath): it guards every push on the machine,
// in or out of Claude Code. These helpers point git at this plugin copy, or take it away.
export const hooksDir = (root: string) => `${root.replace(/\\/g, '/')}/git-hooks`

// a hooks path that is some prime-guard copy's git-hooks (another version folder, or a checkout)
export const isGuardHooks = (path: string) => /(^|\/)prime-guard(\/[^/]+)?\/git-hooks\/?$/i.test(path.trim().replace(/\\/g, '/'))

// after a plugin update the old version folder goes away; git silently runs no hooks from a missing
// folder, so a path that belongs to another prime-guard copy moves to this one. Anything else stays.
export const repoint = (current: string, ours: string) => (isGuardHooks(current) && current.trim().replace(/\\/g, '/') !== ours ? ours : null)
