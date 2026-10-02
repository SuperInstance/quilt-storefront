// tests/07-freeze.test.mjs — lane 67-c: the grind-down made real, under test.
//
// Covers the fallback-first frozen path (refunder.frozen), the refunder PRE-VECTOR
// formula, the answer-class map, the real freezingTest instrument, and the
// evidence-or-nothing law on the live sheet. Mock backends only — no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEngine } from '../src/engine.js';
import { clearCache, bucketVector } from '../../quilt-softjoints/src/joint.js';
import { freezingTest } from '../../quilt-softjoints/src/decompose.js';
import { factsClass } from '../../quilt-softjoints/src/facts.js';
import { refunderPreVector, PREVECTORS } from '../src/vector.js';
import { extractRefunderFacts } from '../src/facts.js';
import { classifyRefundAnswer, runFreezeTest } from '../src/freeze.js';

const sheet = JSON.parse(readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
// v2 (wave-68): the refunder is a factRequired region — the frozen key is the
// pre-vector region PLUS the policy-input facts class (receipt-mentioned,
// purchase-window). The moment under test must GROUND its receipt fact or the
// joint refuses it (E_FACTS_REQUIRED) before any model call.
const UPSET_MILK = 'the milk I bought yesterday spoiled early and I am upset — I have the receipt right here';
const FREEZE_KINDS = ['receipt-mentioned', 'purchase-window'];
const v2Region = (m) => `${bucketVector(refunderPreVector(m), 3)}|${factsClass(extractRefunderFacts(m), { kinds: FREEZE_KINDS })}`;
const FROZEN_REGION = v2Region(UPSET_MILK);

function mockDeepinfra(counter) {
  return {
    type: 'deepinfra-chat', model: 'gpt-oss-20b',
    async call({ state }) {
      counter.calls += 1;
      return { answer: `mock-joint for ${state.message}`, vector: { distress: 0.5, goodwill: 0.5, 'repeat-customer': 0.5 }, confidence: 0.9, usage: { t: 1 }, latency_ms: 1 };
    },
  };
}

function sheetWithFrozenRow(extra = {}) {
  const s = JSON.parse(JSON.stringify(sheet));
  s.cells.find(c => c.id === 'refunder.frozen').table = {
    [FROZEN_REGION]: {
      class: 'store credit', n: 3,
      answer: "I'm sorry that happened — without a receipt I can offer store credit for the full value, today.",
      evidence: ['test-injected (mechanism proof, not live evidence)'],
      ...extra,
    },
  };
  return s;
}

test('frozen-path HIT: a covered moment is served by the lookup row with ZERO model calls', async () => {
  clearCache();
  const counter = { calls: 0 };
  const backends = { 'deepinfra-chat:gpt-oss-20b': mockDeepinfra(counter), 'typesafe-systemone:jev-latest': { type: 'typesafe-systemone', model: 'jev-latest', async call() { counter.calls += 1; return { answer: 'fallback.policy', vector: {}, confidence: 1, usage: null, latency_ms: 0 }; } } };
  const e = makeEngine(sheetWithFrozenRow(), { backends, budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession([UPSET_MILK]);
  assert.equal(t.route, 'refunder.joint', 'upset-milk routes to the refunder');
  assert.equal(t.answer_source, 'frozen-lookup', 'THE GRIND-DOWN: the frozen row served the moment');
  assert.match(t.reply, /store credit/);
  assert.equal(t.frozen.region, FROZEN_REGION);
  assert.equal(t.frozen.n, 3);
  assert.equal(counter.calls, 0, 'no model call may happen when the frozen table covers the moment');
});

test('frozen-path MISS: an uncovered moment falls through to the live joint', async () => {
  clearCache();
  const counter = { calls: 0 };
  const backends = { 'deepinfra-chat:gpt-oss-20b': mockDeepinfra(counter) };
  const e = makeEngine(sheetWithFrozenRow(), { backends, budget: { typesafe: 9, deepinfra: 9 } });
  // regular-customer moment buckets to a DIFFERENT region (repeat-customer:2) — not covered.
  // The receipt fact IS grounded so the joint may rule (v2: facts decide outcomes).
  const [t] = await e.runSession(['you know me, I am in here every week — this bread is stale, I have the receipt right here, I would like to return it']);
  assert.equal(t.route, 'refunder.joint');
  assert.equal(t.answer_source, 'deepinfra-chat', 'the joint answered');
  assert.equal(counter.calls, 1, 'exactly one model call');
  assert.match(t.reply, /^mock-joint/, 'the reply came from the joint, not the frozen table');
});

test('empty live table = pure fall-through (evidence-or-nothing law)', async () => {
  clearCache();
  const counter = { calls: 0 };
  const backends = { 'deepinfra-chat:gpt-oss-20b': mockDeepinfra(counter) };
  const e = makeEngine(sheet, { backends, budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession([UPSET_MILK]);
  assert.equal(t.answer_source, 'deepinfra-chat');
  assert.equal(counter.calls, 1);
  const frozenCell = sheet.cells.find(c => c.id === 'refunder.frozen');
  assert.equal(Object.keys(frozenCell.table).length, 0, 'the LIVE frozen table ships EMPTY: rows come only from freezing-test evidence (eval/freeze-report.json verdict: no-freeze)');
  assert.equal(sheet.cells.find(c => c.id === 'refunder.joint').freeze_table, 'refunder.frozen', 'the joint declares its frozen table');
});

test('refunder pre-vector: deterministic, in-range, and ordered by emotional register', () => {
  const v = (m) => refunderPreVector(m);
  for (const m of ['furious and unacceptable', 'I am a bit upset', 'calm return please']) {
    const r = v(m);
    for (const d of ['distress', 'goodwill', 'repeat-customer']) {
      assert.ok(Number.isFinite(r[d]) && r[d] >= 0 && r[d] <= 1, `${d} of "${m}" in 0..1`);
    }
  }
  assert.deepEqual(v('the milk I bought yesterday spoiled early and I am upset'), v('the milk I bought yesterday spoiled early and I am upset'), 'deterministic');
  assert.ok(v('the toaster broke and I am furious').distress > v('I would like to return these socks please').distress, 'furious > calm on distress');
  assert.ok(v('you know me, I am in here every week')['repeat-customer'] > v('it is my first time here')['repeat-customer'], 'regular > first-timer');
  assert.equal(PREVECTORS['refunder-lexicon'], refunderPreVector, 'the sheet-named prevector resolves in the registry');
});

test('answer-class map: first mention of the policy outcome wins', () => {
  assert.equal(classifyRefundAnswer("You'll receive a store credit for the spoiled milk."), 'store credit');
  assert.equal(classifyRefundAnswer('You qualify for a full refund per our 7-day return policy.'), 'full refund');
  assert.equal(classifyRefundAnswer('A full refund with a receipt; otherwise we can offer you a store credit.'), 'full refund', 'the model LED with full refund');
  assert.equal(classifyRefundAnswer('After 7 days this needs a manager review.'), 'manager review');
  assert.equal(classifyRefundAnswer('something unclassifiable'), 'other');
});

test('the real freezingTest instrument promotes a unanimous n=3 region (and only that)', () => {
  const msgs = ['the milk is spoiled and I am upset', 'the juice is spoiled and I am upset', 'the cream is spoiled and I am upset'];
  const obs = msgs.map(m => ({ vector: refunderPreVector(m), output: 'full refund' }));
  const props = freezingTest(obs, { threshold: 3, buckets: 3 });
  assert.equal(props.length, 1, 'one region freezes');
  assert.equal(props[0].n, 3);
  assert.equal(props[0].region, 'distress:1|goodwill:1|repeat-customer:0');
  // a region with a single dissenter must NOT freeze
  const mixed = [...obs, { vector: refunderPreVector(msgs[0]), output: 'store credit' }];
  assert.equal(freezingTest(mixed, { threshold: 3, buckets: 3 }).length, 0, 'unanimity is the law');
});

test('live freeze report exists and honestly reports the verdict', () => {
  const report = runFreezeTest({ threshold: 3 });
  assert.ok(report.observations.length >= 7, 'both live sessions + replays feed the test');
  assert.equal(report.verdict, 'no-freeze', 'lane 67-c verdict: no region reached n>=3 unanimity — the joint stays soft');
  assert.ok(report.sweeps.some(s => s.regions.some(r => r.unanimous && r.n === 2)), 'the emergent n=2 region is reported, not hidden');
});
