#!/usr/bin/env node
// op model config: one reasoning budget and a model per role, shared by /op-mode subagents and the Prime herdr team.
// usage: op-config.mjs show [--budget <b>] [--json]      resolved table (a --budget previews without writing)
//        op-config.mjs set [--budget <b>] [role=model[:effort] | role=default ...]   merge choices into the file
//        op-config.mjs get <role> model|effort           resolved value, empty when no file was written yet
//        op-config.mjs path
// File: $OP_CONFIG or ~/.claude/op/models.json, holding only the user's choices; effort is derived on every read,
// so a new budget moves every role that has no pinned effort. Exit: 0 ok, 2 usage or invalid value.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BUDGETS = { unlimited: 'max', large: 'xhigh', medium: 'high', small: 'medium' };
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku', 'fable', 'inherit'];
// step = effort steps from the budget's level. At `large` these match the agents' own frontmatter and the plugin config.
export const ROLES = {
  hub: { model: 'opus', step: 1, does: 'the /op-mode chat and the prime-orchestrator hub: route, plan, dispatch' },
  hardest: { model: 'opus', step: 1, does: 'cross-cutting design, concurrency, subtle algorithms' },
  builder: { model: 'sonnet', step: -1, does: 'focused code changes: the claude-code teammate and code subagents' },
  reviewer: { model: 'opus', step: -1, does: 'plan and code review (prime-reviewer), judgment and prose' },
  verifier: { model: 'sonnet', step: -1, does: 'independent checks of finished work, never by its author' },
  explorer: { model: 'haiku', step: -2, does: 'read-only searches and file sweeps' },
  codex: { model: 'gpt-6.1-sol', step: 0, does: 'the Codex CLI teammate and the second opinion in reviews' },
};

export const configPath = () => process.env.OP_CONFIG || join(homedir(), '.claude', 'op', 'models.json');
const fail = (msg) => { const e = new Error(msg); e.usage = true; throw e; };

export function resolve(cfg = {}) {
  const budget = cfg.budget ?? 'large';
  if (!BUDGETS[budget]) fail(`budget '${budget}' must be one of ${Object.keys(BUDGETS).join(', ')}`);
  const base = EFFORTS.indexOf(BUDGETS[budget]);
  const roles = Object.fromEntries(Object.entries(ROLES).map(([role, d]) => {
    const pin = cfg.roles?.[role] ?? {};
    // Codex reasoning tops out at xhigh
    const top = role === 'codex' ? EFFORTS.indexOf('xhigh') : EFFORTS.length - 1;
    const effort = pin.effort ?? EFFORTS[Math.min(top, Math.max(0, base + d.step))];
    return [role, { model: pin.model ?? d.model, effort, does: d.does, pinned: Boolean(pin.model || pin.effort) }];
  }));
  return { budget, effort: BUDGETS[budget], roles };
}

export function parseChoice(arg) {
  const m = /^([a-z]+)=(.+)$/.exec(arg) ?? fail(`'${arg}' must be role=model[:effort] or role=default`);
  const [, role, value] = m;
  if (!ROLES[role]) fail(`unknown role '${role}' (${Object.keys(ROLES).join(', ')})`);
  if (value === 'default') return [role, null];
  const [model, effort, extra] = value.split(':');
  if (extra !== undefined) fail(`'${arg}' has more than one ':'`);
  if (role === 'codex' ? !/^[\w.-]+$/.test(model) : !CLAUDE_MODELS.includes(model) && !/^claude-[a-z0-9.-]+$/.test(model))
    fail(`model '${model}' for ${role} must be ${role === 'codex' ? 'a Codex model id' : CLAUDE_MODELS.join(', ') + ' or a claude-* id'}`);
  const efforts = role === 'codex' ? EFFORTS.slice(0, -1) : EFFORTS;
  if (effort !== undefined && !efforts.includes(effort)) fail(`effort '${effort}' for ${role} must be one of ${efforts.join(', ')}`);
  return [role, { model, ...(effort && { effort }) }];
}

export function apply(cfg, budget, choices) {
  const roles = { ...cfg.roles };
  for (const [role, pin] of choices) if (pin) roles[role] = pin; else delete roles[role];
  const next = { budget: budget ?? cfg.budget ?? 'large', roles };
  resolve(next);
  return next;
}

const read = () => {
  const p = configPath();
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { fail(`${p} is not valid JSON: run /setup-op again`); }
};

function table(r) {
  const rows = Object.entries(r.roles).map(([role, v]) =>
    `${role.padEnd(9)} ${v.model.padEnd(12)} ${v.effort.padEnd(7)} ${v.pinned ? 'set ' : '    '} ${v.does}`);
  return [`budget: ${r.budget} (${r.effort})`, `role      model        effort  pin  does`, ...rows].join('\n');
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (name) => { const i = rest.indexOf(name); if (i < 0) return undefined; const v = rest[i + 1]; rest.splice(i, 2); return v ?? fail(`${name} needs a value`); };
  if (cmd === 'path') return console.log(configPath());
  if (cmd === 'show') {
    const json = rest.includes('--json'); if (json) rest.splice(rest.indexOf('--json'), 1);
    const budget = flag('--budget');
    const cfg = read();
    const r = resolve({ ...cfg, ...(budget && { budget }) });
    if (json) return console.log(JSON.stringify({ file: configPath(), written: Boolean(cfg), ...r }, null, 2));
    console.log(`${table(r)}\n${cfg ? `from ${configPath()}` : 'defaults: /setup-op has not been run'}`);
    return;
  }
  if (cmd === 'set') {
    const budget = flag('--budget');
    const next = apply(read() ?? {}, budget, rest.map(parseChoice));
    mkdirSync(dirname(configPath()), { recursive: true });
    writeFileSync(configPath(), JSON.stringify(next, null, 2) + '\n');
    return console.log(`${table(resolve(next))}\nwrote ${configPath()}`);
  }
  if (cmd === 'get') {
    const [role, field] = rest;
    if (!ROLES[role] || !['model', 'effort'].includes(field)) fail('usage: get <role> model|effort');
    const cfg = read();
    if (!cfg) return; // no choices made: callers keep their own defaults
    const v = resolve(cfg).roles[role][field];
    if (v !== 'inherit') console.log(v);
    return;
  }
  fail('usage: op-config.mjs show|set|get|path (see the header of this file)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (e) {
    console.error(`[op-config] ${e.message}`);
    process.exit(e.usage ? 2 : 1);
  }
}
