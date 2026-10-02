// tests/09-greeter-territory.test.mjs — the greeter law WIRED (wave-72, 72-b-r2).
//
// Upstream (quilt-softjoints @ 88c6608, lane 72-b) turned the measured wrong-joint
// tell into a selection rule and made runJoint route tagged cells GREETER-FIRST.
// This suite proves the storefront wiring: greeter.voice is tagged greeter-territory
// on the receipted lift evidence (receipted-replay over the real 71-c corpus — ZERO
// model calls; receipts/greeter-law-validation.json, adopted from 72-b), and a
// greeter moment serves from the AUTHORED table with zero model calls — on a table
// hit AND on a table miss (the ask-back) — while the model seat is never spent on
// the region. The frozen refund table is fact territory and untouched by the wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeEngine } from '../src/engine.js';
import { runJoint, clearCache } from '../../quilt-softjoints/src/joint.js';
import { freezingTest } from '../../quilt-softjoints/src/decompose.js';

const sheet = JSON.parse(readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
const lexicon = sheet.cells.find(c => c.id === 'greeter-lexicon');
const askBack = sheet.cells.find(c => c.id === 'greeter.ask-back');
const greeter = sheet.cells.find(c => c.id === 'greeter.voice');
const battery = JSON.parse(readFileSync(new URL('../eval/greeter-battery.json', import.meta.url), 'utf8'));
const sha256File = (p) => 'sha256:' + createHash('sha256').update(readFileSync(p)).digest('hex');

// any model spend on greeter territory is a LOUD failure: the hostile backends
// throw, so a seat spend fails the test instead of passing quietly.
const hostileBackends = () => ({
  'deepinfra-chat:gpt-oss-20b': {
    type: 'deepinfra-chat', model: 'gpt-oss-20b',
    async call() { throw new Error('MODEL SEAT SPENT ON GREETER TERRITORY'); },
  },
  'typesafe-systemone:jev-latest': {
    type: 'typesafe-systemone', model: 'jev-latest',
    async call() { throw new Error('CLASSIFIER SPENT'); },
  },
});

test('greeter-territory wiring: the tag, the route, the ask-back (sheet invariants)', () => {
  assert.equal(greeter.kind, 'softjoint');
  assert.equal(greeter.greeter, true, 'still the greeter cell');
  assert.equal(greeter.fallback, null, 'the no-script law holds on the model seat');
  assert.equal(greeter.factRequired, undefined, 'condition (a): outcome-free — no policy outcome binds here');
  assert.equal(greeter.greeterTerritory, true, 'tagged greeter-territory (the 72-b selection rule)');
  assert.equal(greeter.greeter_route, 'greeter-lexicon', 'the authored table is consulted before the seat');
  assert.equal(greeter.greeter_miss, 'ask-back', 'the storefront takes the ask-back strength');
  assert.equal(greeter.ask_back, 'greeter.ask-back');
  assert.equal(lexicon.kind, 'lookup');
  assert.equal(lexicon.default, null, 'the table arm never guesses a register');
  assert.equal(askBack.kind, 'lookup');
  assert.ok(askBack.table?.default, 'the ask-back is authored, not null');
  const refunder = sheet.cells.find(c => c.id === 'refunder.joint');
  assert.notEqual(refunder.greeterTerritory, true, 'fact territory is NOT greeter territory (corpus B refused)');
  assert.equal(refunder.factRequired, true, 'and fact territory keeps its fact gate');
  // the warmth rule rides LAST (rule-order law: policy/intent keywords outrank warmth)
  const router = sheet.cells.find(c => c.kind === 'router');
  const last = router.rules[router.rules.length - 1];
  assert.equal(last.route, 'greeter.voice', 'warmth rules converge on the TAGGED cell');
  assert.deepStrictEqual(last.any, battery.greeterRuleKeywords, 'the 71-c warmth keywords, verbatim');
  const refundIdx = router.rules.findIndex(r => r.route === 'refunder.joint');
  assert.ok(refundIdx > -1 && refundIdx < router.rules.length - 1, 'policy rules still outrank warmth');
});

test('LIVE PROOF: a greeter moment on the tagged cell serves the authored table with ZERO model calls', async () => {
  clearCache();
  const e = makeEngine(sheet, { backends: hostileBackends(), budget: { typesafe: 0, deepinfra: 0 } });
  const [t] = await e.runSession(['good morning!']);
  assert.equal(t.route, 'greeter.voice');
  assert.equal(t.reply, lexicon.table['morning'], 'the AUTHORED line, byte-equal to the 71-c battery draft');
  assert.equal(t.reply, battery.greeterLexiconDraft['morning']);
  assert.equal(t.answer_source, 'greeter-table', 'served greeter-first, before any seat');
  assert.equal(t.greeter_first, true, 'the trace receipts the greeter-first routing');
  assert.equal(t.greeter_route, 'greeter-lexicon');
  assert.equal(t.frozen, undefined, 'the frozen refund table is not consulted on greeter territory');
  assert.ok(t.usage == null && !t.latency_ms, 'zero model spend, zero latency');
});

test('even when the authored table MISSES, the moment serves zero-call: the ask-back opens, the seat never does', async () => {
  clearCache();
  const e = makeEngine(sheet, { backends: hostileBackends(), budget: { typesafe: 0, deepinfra: 0 } });
  // 'hi!' is a warmth keyword (rule-routed to the tagged cell) but NOT a lexicon register
  const [t] = await e.runSession(['hi!']);
  assert.equal(t.route, 'greeter.voice');
  assert.equal(t.answer_source, 'ask-back');
  assert.equal(t.reply, askBack.table.default, 'the authored ask-back, not silence-by-accident, not a script');
  assert.equal(t.routed_to, 'greeter.ask-back');
  assert.equal(t.routed_via, 'greeter-ask-back');
  assert.equal(t.greeter_first, true);
  assert.ok(t.usage == null && !t.latency_ms, 'a miss spends NOTHING — the seat is never bought on greeter territory');
});

test('upstream mechanism direct: runJoint routes the tagged cell GREETER-FIRST (softjoints @ 88c6608)', async () => {
  clearCache();
  const backend = { type: 'deepinfra-chat', model: 'gpt-oss-20b', async call() { throw new Error('seat spent'); } };
  const hit = await runJoint(sheet, 'greeter.voice', { state: { message: 'you know me — the usual?' } }, { backend });
  assert.equal(hit.answer, lexicon.table['regular']);
  assert.equal(hit.source, 'greeter-table');
  assert.equal(hit.confidence, 0.9);
  assert.equal(hit.model, null, 'no model on the serving path');
  assert.equal(hit.usage, null);
  assert.equal(hit.latency_ms, 0);
  const miss = await runJoint(sheet, 'greeter.voice', { state: { message: 'something no register covers' } }, { backend });
  assert.equal(miss.source, 'ask-back');
  assert.equal(miss.routed_to, 'greeter.ask-back');
  assert.equal(miss.answer, askBack.table.default);
});

test('the greeter never freezes: freezingTest exempts tagged observations — and only the tag does that', () => {
  const obs = [1, 2, 3].map(() => ({
    vector: { warmth: 0.9, familiarity: 0.5, mood: 0.8, openness: 0.6 },
    output: 'same warm line',
    greeterTerritory: true,
  }));
  const exempt = freezingTest(obs, { detail: true });
  assert.deepEqual(exempt.proposals, [], 'no freeze-proposal on greeter territory — warmth is authored, never ground down');
  assert.equal(exempt.greeterExempt.length, 1, 'the exemption is reported, never silent');
  assert.equal(exempt.greeterExempt[0].flagged, 3);
  const plain = freezingTest(obs.map(({ vector, output }) => ({ vector, output })));
  assert.equal(plain.length, 1, 'control: the same unanimity WITHOUT the tag would freeze — the exemption is the tag, not the data');
});

test('the authored register lines are the receipted 71-c drafts, byte-equal (nothing retuned)', () => {
  for (const [key, line] of Object.entries(battery.greeterLexiconDraft)) {
    assert.equal(lexicon.table[key], line, `register "${key}" is the receipted draft, unretuned`);
  }
  for (const m of battery.greeterMoments) {
    const kw = battery.greeterRuleKeywords.find(k => m.message.toLowerCase().includes(k));
    assert.ok(kw, `${m.id} ("${m.message}") is rule-routed to the tagged cell`);
    assert.equal(lexicon.table[m.key], battery.greeterLexiconDraft[m.key]);
  }
});

test('the wiring cites its lift evidence: the receipted-replay validation rides in-repo', () => {
  const receipt = JSON.parse(readFileSync(new URL('../receipts/greeter-law-validation.json', import.meta.url), 'utf8'));
  assert.equal(receipt.metrics.greeter.lift, -0.25, 'the receipted tell: agreement without lift');
  assert.equal(receipt.metrics.greeter.usablePairs, 4);
  assert.equal(receipt.metrics.greeter.unpaired, 8, 'silent seats receipted unpaired, never guessed into the mean');
  assert.equal(receipt.metrics.greeter.territory, true, 'GREETER-TERRITORY confirmed');
  assert.equal(receipt.metrics.controls.territory, false, 'fact controls refused — the rule discriminates the joints');
  assert.equal(
    receipt.sources.battery,
    sha256File(new URL('../eval/greeter-battery.json', import.meta.url).pathname),
    'the evidence binds the SAME battery the 71-c demo scored (verify-then-adopt)',
  );
  assert.match(receipt.mode, /ZERO new model calls/, 'the replay spent nothing (re-judging would double-spend)');
});
