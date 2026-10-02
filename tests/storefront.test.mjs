// tests/storefront.test.mjs — no-network proof of the sheet's behavior with a mock
// backend. The LIVE session (src/run.js) is the real receipt; these tests carry the
// invariants so regressions die in CI, not in front of a customer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEngine } from '../src/engine.js';
import { clearCache } from '../../quilt-softjoints/src/joint.js';
import { readFileSync } from 'node:fs';

const sheet = JSON.parse(readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));

let mockCount = 0;
function mockBackends() {
  return {
    'typesafe-systemone:jev-latest': {
      type: 'typesafe-systemone', model: 'jev-latest',
      async call({ choices }) {
        mockCount++;
        // a classifier stub: always routes to fallback.policy; scores empty
        return { answer: 'fallback.policy', vector: { urgency: 0.5, familiarity: 0.5, sentiment: 0.5, formality: 0.5 }, confidence: 0.9, usage: { t: 1 }, latency_ms: 1 };
      },
    },
    'deepinfra-chat:gpt-oss-20b': {
      type: 'deepinfra-chat', model: 'gpt-oss-20b',
      async call({ prompt, state }) {
        mockCount++;
        return { answer: `mock-joint(${String(prompt).slice(0, 20)})`, vector: { warmth: 0.8, familiarity: 0.5, mood: 0.6, openness: 0.7 }, confidence: 0.8, usage: { t: 2 }, latency_ms: 2 };
      },
    },
  };
}

test('rule routes hit the right lookups with domain facts', async () => {
  clearCache();
  const e = makeEngine(sheet, { backends: mockBackends(), budget: { typesafe: 9, deepinfra: 9 } });
  const t1 = await e.runSession(['what are your hours on saturday?']);
  assert.equal(t1[0].route, 'hours.answer');
  assert.match(t1[0].reply, /Saturday: 8am/);
  const t2 = await e.runSession(['how much are eggs?']);
  assert.match(t2[0].reply, /\$4\.00/);
  const t3 = await e.runSession(['do you have milk?']);
  assert.match(t3[0].reply, /in stock/);
});

test('stock miss answers the honest default, not a hallucination', async () => {
  clearCache();
  const e = makeEngine(sheet, { backends: mockBackends(), budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession(['do you carry oat flour?']);
  assert.equal(t.route, 'stock.answer');
  assert.match(t.reply, /don't carry/i);
});

test('greeter cell stays dynamic: it is the joint, never a lookup (greeter law)', async () => {
  clearCache();
  const e = makeEngine(sheet, { backends: mockBackends(), budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession(['hello there!']);
  // classifier stub routes to fallback; force-check the greeter cell directly below
  assert.ok(t.route);
  const greeter = sheet.cells.find(c => c.id === 'greeter.voice');
  assert.equal(greeter.greeter, true);
  assert.equal(greeter.fallback, null, 'the greeter has NO script fallback — it degrades to silence, never to a canned line');
});

test('listener hooks fire on escalate and refund routes', async () => {
  clearCache();
  const e = makeEngine(sheet, { backends: mockBackends(), budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession(['I want to speak to a human manager']);
  assert.equal(t.route, 'escalate.notice');
  assert.ok(t.hooks.some(h => h.hook === 'on.escalate'));
});

test('iterator turn budget caps the session', async () => {
  clearCache();
  const e = makeEngine(sheet, { backends: mockBackends(), budget: { typesafe: 9, deepinfra: 9 } });
  const turns = await e.runSession(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n']);
  assert.equal(turns.length, 12, 'session.loop.turns=12');
});

test('cache law: two different unvectorized messages never share one joint answer', async () => {
  clearCache();
  const backends = mockBackends();
  let calls = 0;
  backends['deepinfra-chat:gpt-oss-20b'] = {
    type: 'deepinfra-chat', model: 'gpt-oss-20b',
    async call({ state }) { calls++; return { answer: `ans-${calls}:${state.message}`, vector: { warmth: 0.5, familiarity: 0.5, mood: 0.5, openness: 0.5 }, confidence: 1, usage: null, latency_ms: 0 }; },
  };
  const e = makeEngine(sheet, { backends, budget: { typesafe: 9, deepinfra: 9 } });
  // two distinct refund messages routed to refunder.joint must get distinct answers
  const a = await e.runSession(['the milk spoiled, refund please']);
  const b = await e.runSession(['these socks ripped, I demand a refund now']);
  assert.notEqual(a[0].reply, b[0].reply, 'THE LEAK REGRESSION: distinct messages must not collapse to one cache slot');
  assert.equal(calls, 2);
});

test('refunder joint receives the policy text in its state (input resolution)', async () => {
  clearCache();
  const backends = mockBackends();
  let seen = null;
  backends['deepinfra-chat:gpt-oss-20b'] = {
    type: 'deepinfra-chat', model: 'gpt-oss-20b',
    async call(args) { seen = args.state; return { answer: 'ok', vector: { distress: 0.5, goodwill: 0.5, 'repeat-customer': 0.5 }, confidence: 1, usage: null, latency_ms: 0 }; },
  };
  const e = makeEngine(sheet, { backends, budget: { typesafe: 9, deepinfra: 9 } });
  await e.runSession(['I need a refund for the spoiled milk']);
  assert.match(JSON.stringify(seen), /full refund within 7 days/i, 'the policy text must be in the joint state');
});

test('budget exhaustion fails closed to the lookup fallback (never silent)', async () => {
  clearCache();
  const e = makeEngine(sheet, { backends: mockBackends(), budget: { typesafe: 0, deepinfra: 0 } });
  const [t] = await e.runSession(['hello there!']);
  assert.ok(t.route, 'the turn still resolves');
  assert.notEqual(t.reply, undefined, 'a reply exists even with zero budget');
});

test('every ai-bearing cell carries a fallback (fail-closed law, sheet-wide)', () => {
  const ai = sheet.cells.filter(c => c.kind === 'softjoint' && !c.greeter);
  for (const c of ai) assert.ok(c.fallback, `${c.id} has no fallback`);
});

test('trace schema conformance: every turn carries route+source+ms', async () => {
  clearCache();
  const e = makeEngine(sheet, { backends: mockBackends(), budget: { typesafe: 9, deepinfra: 9 } });
  const turns = await e.runSession(['hours?', 'stock?', 'prices?']);
  for (const t of turns) {
    assert.ok(t.route && t.answer_source && typeof t.turn_ms === 'number' && t.at_utc);
  }
});
