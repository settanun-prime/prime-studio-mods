import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLUGIN_ROOT,
  validate,
  checkPlan,
  streamId,
  hashStreams,
  loadConfig,
  SLUG_RE,
} from '../scripts/lib/prime-node.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✘ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('Running prime-workflow unit test suite:');

// 1. Config and schema validation
test('prime.config.json matches prime.config.schema.json', () => {
  const cfg = loadConfig();
  const schema = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'prime.config.schema.json'), 'utf8'));
  const errors = validate(cfg, schema, 'config');
  assert.equal(errors.length, 0, `Config errors: ${errors.join(', ')}`);
});

test('agent markdown frontmatters match budgets.perRole', () => {
  const cfg = loadConfig();
  const agentsDir = join(PLUGIN_ROOT, 'agents');
  for (const [role, budget] of Object.entries(cfg.budgets?.perRole || {})) {
    const f = join(agentsDir, `${role}.md`);
    assert.ok(existsSync(f), `Missing agent file for ${role}`);
    const content = readFileSync(f, 'utf8');
    const fm = (content.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
    const turnsMatch = fm.match(/^maxTurns:\s*(\d+)\s*$/m);
    assert.ok(turnsMatch, `Missing maxTurns in ${role}.md`);
    assert.equal(Number(turnsMatch[1]), budget.maxTurns, `maxTurns mismatch in ${role}.md`);
    assert.ok(!/^tools:/m.test(fm), `${role}.md must not use tools allowlist`);
  }
});

// 2. Plan schema and playbooks
const planSchema = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'prime.plan.schema.json'), 'utf8'));

test('valid plan with blast radius and stream playbooks passes schema', () => {
  const plan = {
    version: 1,
    title: 'test-plan',
    status: 'draft',
    goal: 'Ship v1.0.0 release',
    blastRadius: {
      affectedModules: ['src/core', 'src/api'],
      sharedState: ['db/migrations'],
      externalDependents: ['web-client'],
      dataMigrations: false,
    },
    streams: [
      {
        slug: 'core-feature',
        playbook: 'feature',
        role: 'claude-code',
        summary: 'Core implementation',
        paths: ['src/core/'],
        dependsOn: [],
        acceptance: ['npm test -- core'],
      },
      {
        slug: 'api-fix',
        playbook: 'bug-fix',
        role: 'codex',
        summary: 'API bug fix',
        paths: ['src/api/'],
        dependsOn: ['core-feature'],
        acceptance: ['npm test -- api'],
      },
    ],
  };

  const errors = validate(plan, planSchema, 'plan');
  assert.equal(errors.length, 0, `Plan errors: ${errors.join(', ')}`);
});

test('plan rejects invalid stream playbook enum', () => {
  const plan = {
    version: 1,
    title: 'test-plan',
    status: 'draft',
    goal: 'Test invalid playbook',
    streams: [
      {
        slug: 'bad-stream',
        playbook: 'invalid-playbook-name',
        role: 'claude-code',
        summary: 'Bad stream',
        paths: ['src/'],
        acceptance: ['true'],
      },
    ],
  };

  const errors = validate(plan, planSchema, 'plan');
  assert.ok(errors.some((e) => e.includes('playbook')), 'Should flag invalid playbook');
});

test('all 5 stream playbooks are valid in schema', () => {
  const playbooks = ['feature', 'bug-fix', 'refactor', 'perf', 'investigation'];
  for (const pb of playbooks) {
    const plan = {
      version: 1,
      title: 'playbook-test',
      status: 'draft',
      goal: `Test ${pb}`,
      streams: [
        {
          slug: `stream-${pb}`,
          playbook: pb,
          role: 'claude-code',
          summary: `Test ${pb}`,
          paths: ['src/'],
          acceptance: ['true'],
        },
      ],
    };
    const errors = validate(plan, planSchema, 'plan');
    assert.equal(errors.length, 0, `Playbook ${pb} failed: ${errors.join(', ')}`);
  }
});

// 3. checkPlan constraints and logic
test('checkPlan flags duplicate slugs', () => {
  const plan = {
    version: 1,
    title: 'dup-test',
    status: 'draft',
    goal: 'Test duplicates',
    streams: [
      { slug: 'same-slug', role: 'claude-code', paths: ['src/a/'], acceptance: ['true'] },
      { slug: 'same-slug', role: 'codex', paths: ['src/b/'], acceptance: ['true'] },
    ],
  };
  const { errors } = checkPlan(plan, loadConfig(), false);
  assert.ok(errors.some((e) => e.includes('duplicate slug')), 'Should flag duplicate slug');
});

test('checkPlan flags circular dependencies', () => {
  const plan = {
    version: 1,
    title: 'cycle-test',
    status: 'draft',
    goal: 'Test circular dependencies',
    streams: [
      { slug: 'stream-a', role: 'claude-code', paths: ['src/a/'], dependsOn: ['stream-b'], acceptance: ['true'] },
      { slug: 'stream-b', role: 'codex', paths: ['src/b/'], dependsOn: ['stream-a'], acceptance: ['true'] },
    ],
  };
  const { errors } = checkPlan(plan, loadConfig(), false);
  assert.ok(errors.some((e) => e.includes('cycle')), 'Should flag dependency cycle');
});

test('checkPlan flags self dependencies', () => {
  const plan = {
    version: 1,
    title: 'self-dep-test',
    status: 'draft',
    goal: 'Test self dependency',
    streams: [
      { slug: 'stream-self', role: 'claude-code', paths: ['src/'], dependsOn: ['stream-self'], acceptance: ['true'] },
    ],
  };
  const { errors } = checkPlan(plan, loadConfig(), false);
  assert.ok(errors.some((e) => e.includes('depends on itself')), 'Should flag self-dependency');
});

test('checkPlan flags non-repo-relative paths', () => {
  const plan = {
    version: 1,
    title: 'path-test',
    status: 'draft',
    goal: 'Test absolute and traversal paths',
    streams: [
      { slug: 'stream-abs', role: 'claude-code', paths: ['/etc/passwd'], acceptance: ['true'] },
      { slug: 'stream-dotdot', role: 'claude-code', paths: ['../outside'], acceptance: ['true'] },
    ],
  };
  const { errors } = checkPlan(plan, loadConfig(), false);
  assert.ok(errors.some((e) => e.includes('must be repo-relative')), 'Should flag invalid paths');
});

test('checkPlan errors on overlapping paths without dependsOn, warns with dependsOn', () => {
  const planUnordered = {
    version: 1,
    title: 'overlap-err',
    status: 'draft',
    goal: 'Test path overlap error',
    streams: [
      { slug: 'stream-a', role: 'claude-code', paths: ['src/shared/'], acceptance: ['true'] },
      { slug: 'stream-b', role: 'codex', paths: ['src/shared/'], acceptance: ['true'] },
    ],
  };
  const res1 = checkPlan(planUnordered, loadConfig(), false);
  assert.ok(res1.errors.some((e) => e.includes('both own') && e.includes('with no dependsOn')), 'Should error without dependsOn');

  const planOrdered = {
    version: 1,
    title: 'overlap-warn',
    status: 'draft',
    goal: 'Test path overlap warning',
    streams: [
      { slug: 'stream-a', role: 'claude-code', paths: ['src/shared/'], acceptance: ['true'] },
      { slug: 'stream-b', role: 'codex', paths: ['src/shared/'], dependsOn: ['stream-a'], acceptance: ['true'] },
    ],
  };
  const res2 = checkPlan(planOrdered, loadConfig(), false);
  assert.equal(res2.errors.length, 0, 'Ordered overlap should have no errors');
  assert.ok(res2.warnings.some((w) => w.includes('ordered by dependsOn')), 'Should warn with dependsOn');
});

// 4. Stream IDs and Hash determinism
test('streamId is deterministic', () => {
  const s1 = { summary: 'A', paths: ['src/'], acceptance: ['npm test'] };
  const s2 = { summary: 'A', paths: ['src/'], acceptance: ['npm test'] };
  assert.equal(streamId(s1), streamId(s2));
  assert.ok(streamId(s1).startsWith('st-'));
});

test('hashStreams produces 16-hex characters hash', () => {
  const p = { goal: 'Test', base: 'main', streams: [{ slug: 's', role: 'claude-code', paths: ['src/'], acceptance: ['true'] }] };
  const hash = hashStreams(p);
  assert.equal(hash.length, 16);
  assert.ok(/^[0-9a-f]{16}$/.test(hash));
});

// 5. Slug validation regex
test('SLUG_RE validates slugs according to specification', () => {
  assert.ok(SLUG_RE.test('valid-slug-1'));
  assert.ok(SLUG_RE.test('api_v2.test'));
  assert.ok(!SLUG_RE.test('-invalid'));
  assert.ok(!SLUG_RE.test('.invalid'));
  assert.ok(!SLUG_RE.test(''));
  assert.ok(!SLUG_RE.test('has spaces'));
  assert.ok(!SLUG_RE.test('UPPERCASE'));
});

console.log(`\nTotal: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
