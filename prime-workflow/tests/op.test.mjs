// op-config budget mapping and validation, and a structure lint: every file, section and script op-mode names exists.
// usage: node tests/op.test.mjs <tmpdir>
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { resolve, parseChoice, apply, ROLES } from '../scripts/op-config.mjs';
import { PLUGIN_ROOT } from '../scripts/lib/prime-node.mjs';

const T = process.argv[2];
assert.ok(T, 'usage: node tests/op.test.mjs <tmpdir>');
const effort = (cfg, role) => resolve(cfg).roles[role].effort;

// at `large` the defaults equal the agents' own frontmatter, so an unset config changes nothing
const fm = (agent, key) => new RegExp(`^${key}: (.+)$`, 'm').exec(readFileSync(join(PLUGIN_ROOT, 'agents', `${agent}.md`), 'utf8'))?.[1];
assert.equal(effort({}, 'builder'), fm('claude-code', 'effort'), 'builder default matches claude-code frontmatter');
assert.equal(effort({}, 'reviewer'), fm('prime-reviewer', 'effort'), 'reviewer default matches prime-reviewer frontmatter');
assert.equal(effort({}, 'hub'), fm('prime-orchestrator', 'effort'), 'hub default matches prime-orchestrator frontmatter');
const cfg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'prime.config.json'), 'utf8'));
assert.equal(resolve({}).roles.codex.model, cfg.codex.model, 'codex default model matches the plugin config');
assert.equal(effort({}, 'codex'), cfg.codex.reasoningEffort, 'codex default effort matches the plugin config');

// budgets shift every unpinned role and clamp at both ends
assert.equal(effort({ budget: 'small' }, 'builder'), 'low');
assert.equal(effort({ budget: 'small' }, 'explorer'), 'low', 'clamped at low');
assert.equal(effort({ budget: 'unlimited' }, 'hub'), 'max', 'clamped at max');
assert.equal(effort({ budget: 'unlimited' }, 'codex'), 'xhigh', 'codex tops out at xhigh');
assert.throws(() => resolve({ budget: 'huge' }), /budget 'huge'/);

// pins survive a budget change; default drops them
let c = apply({}, 'small', [parseChoice('builder=opus:xhigh')]);
assert.deepEqual(resolve(c).roles.builder, { ...resolve(c).roles.builder, model: 'opus', effort: 'xhigh', pinned: true });
c = apply(c, 'unlimited', []);
assert.equal(effort(c, 'builder'), 'xhigh', 'a pinned effort ignores the new budget');
c = apply(c, undefined, [parseChoice('builder=default')]);
assert.equal(resolve(c).roles.builder.pinned, false);
assert.equal(c.budget, 'unlimited', 'set without --budget keeps the budget');

for (const bad of ['nope=opus', 'builder=gpt-5', 'builder=opus:ultra', 'codex=gpt-6.1-sol:max', 'builder', 'builder=opus:high:x'])
  assert.throws(() => parseChoice(bad), undefined, `rejects ${bad}`);
assert.deepEqual(parseChoice('builder=claude-sonnet-5-5'), ['builder', { model: 'claude-sonnet-5-5' }]);

// CLI: get is empty until set writes the file; inherit prints nothing; a broken file exits 2
const cli = (args, file) => {
  try { return { code: 0, out: execFileSync('node', [join(PLUGIN_ROOT, 'scripts/op-config.mjs'), ...args], { env: { ...process.env, OP_CONFIG: file }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }; }
  catch (e) { return { code: e.status, out: String(e.stderr) }; }
};
const f = join(T, 'op-models.json');
rmSync(f, { force: true });
assert.equal(cli(['get', 'builder', 'model'], f).out, '', 'no file: get prints nothing');
assert.equal(cli(['set', '--budget', 'medium', 'reviewer=inherit'], f).code, 0);
assert.equal(cli(['get', 'builder', 'effort'], f).out, 'medium');
assert.equal(cli(['get', 'reviewer', 'model'], f).out, '', 'inherit prints nothing');
assert.equal(cli(['set', 'builder=opus:ultra'], f).code, 2, 'invalid value exits 2');
assert.equal(cli(['get', 'nope', 'model'], f).code, 2);

// structure lint: op-mode and setup-op name only things that exist
const principles = readFileSync(join(PLUGIN_ROOT, 'skills/prime-principles/SKILL.md'), 'utf8');
for (const skill of ['op-mode', 'setup-op']) {
  const text = readFileSync(join(PLUGIN_ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
  for (const [, p] of text.matchAll(/`(playbooks\/[\w-]+\.md)`/g))
    assert.ok(existsSync(join(PLUGIN_ROOT, 'skills/op-mode', p)), `${skill}: ${p} exists`);
  for (const [, p] of text.matchAll(/R\/(scripts\/[\w.-]+)/g))
    assert.ok(existsSync(join(PLUGIN_ROOT, p)), `${skill}: ${p} exists`);
  for (const [, n, letter] of text.matchAll(/§(\d)([A-E])?/g)) {
    assert.match(principles, new RegExp(`^## ${n}\\. `, 'm'), `${skill}: §${n} exists in prime-principles`);
    if (letter) assert.match(principles, new RegExp(`^### ${letter}\\. `, 'm'), `${skill}: §${n}${letter} exists`);
  }
  for (const role of text.matchAll(/`(hub|hardest|builder|reviewer|verifier|explorer|codex)`/g)) assert.ok(ROLES[role[1]]);
}
for (const p of ['prototype', 'autonomous-run', 'pickup', 'pause'])
  for (const [, s] of readFileSync(join(PLUGIN_ROOT, 'skills/op-mode/playbooks', `${p}.md`), 'utf8').matchAll(/R\/(scripts\/[\w.-]+)/g))
    assert.ok(existsSync(join(PLUGIN_ROOT, s)), `${p}.md: ${s} exists`);
console.log('op tests passed');
