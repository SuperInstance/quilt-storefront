// tests/08-facts.test.mjs — lane 68-a-r2: the FACT/TONE v2 wiring, under test.
//
// The dead lane (68-a) wrote the contract (quilt-softjoints) and the extractor +
// sheet declarations (storefront) but died before wiring the ENGINE pipeline:
// extraction pre-step → factRequired gate → refusal ROUTING. These tests pin the
// completed wiring. Mock backends only — no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEngine } from '../src/engine.js';
import { clearCache, bucketVector } from '../../quilt-softjoints/src/joint.js';
import { factsClass } from '../../quilt-softjoints/src/facts.js';
import { refunderPreVector } from '../src/vector.js';
import { extractRefunderFacts, FACT_EXTRACTORS, REFUNDER_FREEZE_FACTS, RENDER } from '../src/facts.js';

const sheet = JSON.parse(readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
const ASK_RECEIPT = sheet.cells.find(c => c.id === 'refunder.ask-receipt').default;

function mockDeepinfra(counter, answer = 'mock-joint ruling') {
  return {
    type: 'deepinfra-chat', model: 'gpt-oss-20b',
    async call({ state }) {
      counter.calls += 1;
      return { answer, vector: { distress: 0.5, goodwill: 0.5, 'repeat-customer': 0.5 }, confidence: 0.9, usage: { t: 1 }, latency_ms: 1 };
    },
  };
}

// ---- the domain extractor (rules first — deterministic, evidence-carrying) ----

test('extractor: receipt yes / no / UNSTATED(null) with the evidence span carried', () => {
  const yes = extractRefunderFacts('the milk I bought yesterday spoiled — I have the receipt right here');
  const rYes = yes.find(f => f.kind === 'receipt-mentioned');
  assert.equal(rYes.value, true);
  assert.match(rYes.evidence, /have the receipt/, 'the evidence span is the matched text');
  assert.equal(rYes.how, 'rule', 'rules-first authority');

  const no = extractRefunderFacts('these socks ripped, I lost the receipt, I demand a refund now');
  assert.equal(no.find(f => f.kind === 'receipt-mentioned').value, false);
  assert.match(no.find(f => f.kind === 'receipt-mentioned').evidence, /lost the receipt/);

  const unstated = extractRefunderFacts('the milk I bought yesterday spoiled and I am so upset');
  assert.equal(unstated.find(f => f.kind === 'receipt-mentioned').value, null,
    'the message did not say → stated-unknown (null), never a guess');
  assert.equal(unstated.find(f => f.kind === 'receipt-mentioned').evidence, null);
});

test('extractor: purchase-window maps time phrases to the policy boundary (over/within 7)', () => {
  const w = (m) => extractRefunderFacts(m).find(f => f.kind === 'purchase-window');
  assert.equal(w('bought it yesterday and it broke').value, 'within-7');
  assert.equal(w('bought it two days ago and it broke').value, 'within-7');
  assert.equal(w('bought it three weeks ago and it broke').value, 'over-7');
  assert.equal(w('bought it a month ago and it broke').value, 'over-7');
  assert.equal(w('it just stopped working').value, null, 'no time phrase → stated-unknown');
  assert.match(w('bought it three weeks ago').evidence, /21 days/, 'evidence receipts the computed days');
});

test('extractor: context facts (item, defect-claimed) ride with the moment', () => {
  const facts = extractRefunderFacts('the toaster I bought yesterday does not work');
  assert.equal(facts.find(f => f.kind === 'item').value, 'toaster');
  assert.equal(facts.find(f => f.kind === 'defect-claimed').value, true);
  assert.ok(FACT_EXTRACTORS['refunder-facts'], 'the sheet-named extractor resolves in the registry');
  assert.deepEqual(REFUNDER_FREEZE_FACTS, ['receipt-mentioned', 'purchase-window']);
  assert.ok(RENDER['full refund'], 'the deterministic renderer ships all three outcome classes');
});

// ---- the engine wiring: gate → refusal → ROUTE --------------------------------

test('fact-STARVED refund moment: E_FACTS_REQUIRED refusal routed to the ask-back, ZERO model calls', async () => {
  clearCache();
  const counter = { calls: 0 };
  const e = makeEngine(sheet, { backends: { 'deepinfra-chat:gpt-oss-20b': mockDeepinfra(counter) }, budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession(['the milk I bought yesterday spoiled and I am so upset']);
  assert.equal(t.route, 'refunder.joint');
  assert.equal(t.answer_source, 'fact-refused', 'the gate refused BEFORE any backend call');
  assert.equal(t.fact_refused, true, 'the refusal is receipted in the trace, never swallowed');
  assert.equal(t.error, 'E_FACTS_REQUIRED', 'the named fleet refusal');
  assert.deepEqual(t.missing_facts, ['receipt-mentioned']);
  assert.equal(t.routed_to, 'refunder.ask-receipt', 'routed to the declared fact_fallback cell');
  assert.equal(t.routed_via, 'fact_fallback');
  assert.match(t.reply, /Do you have the receipt/, 'the customer gets the conditional ASK-BACK, never a guessed outcome');
  assert.equal(counter.calls, 0, 'zero model calls — facts decide outcomes');
});

test('a stated-unknown receipt does NOT ground the ruling: still refused (grounded or nothing)', async () => {
  clearCache();
  const counter = { calls: 0 };
  const e = makeEngine(sheet, { backends: { 'deepinfra-chat:gpt-oss-20b': mockDeepinfra(counter) }, budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession(['regarding the receipt for the milk I bought yesterday, it spoiled and I am upset']); // mentions receipt without grounding yes/no
  assert.equal(t.fact_refused, true, 'a mention is not a grounding: null is an un-grounded fact');
  assert.equal(counter.calls, 0);
});

test('GROUNDED facts: the joint rules on them (the pipeline is open when facts decide)', async () => {
  clearCache();
  const counter = { calls: 0 };
  const e = makeEngine(sheet, { backends: { 'deepinfra-chat:gpt-oss-20b': mockDeepinfra(counter) }, budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession(['the milk I bought yesterday spoiled and I am so upset — I have the receipt right here']);
  assert.equal(t.answer_source, 'deepinfra-chat', 'the joint answered — facts were grounded, no refusal');
  assert.equal(counter.calls, 1);
  assert.ok(t.facts, 'the extracted facts ride in the trace receipt');
  assert.equal(t.facts.find(f => f.kind === 'receipt-mentioned').value, true);
});

// ---- the frozen path under v2 keys ---------------------------------------------

test('v2 frozen key: an emotion-ONLY (v1) row can never serve a moment — facts are part of the key', async () => {
  clearCache();
  const counter = { calls: 0 };
  const s = JSON.parse(JSON.stringify(sheet));
  // the 67-c-style v1 row: emotion region only, NO facts class suffix
  s.cells.find(c => c.id === 'refunder.frozen').table = {
    [bucketVector(refunderPreVector('the milk I bought yesterday spoiled early and I am upset — I have the receipt right here'), 3)]: {
      class: 'store credit', n: 3, answer: 'store credit (v1 row)', evidence: ['test-injected mechanism proof'],
    },
  };
  const e = makeEngine(s, { backends: { 'deepinfra-chat:gpt-oss-20b': mockDeepinfra(counter) }, budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession(['the milk I bought yesterday spoiled early and I am upset — I have the receipt right here']);
  assert.notEqual(t.answer_source, 'frozen-lookup',
    'THE LAW: a frozen OUTCOME row keyed on emotion alone is a guess wearing a table\'s clothes — v2 keys must see the facts');
  assert.equal(t.answer_source, 'deepinfra-chat');
});

test('v2 frozen key: a facts-keyed row serves with ZERO model calls (the grind-down, fact-aware)', async () => {
  clearCache();
  const counter = { calls: 0 };
  const s = JSON.parse(JSON.stringify(sheet));
  const msg = 'the milk I bought yesterday spoiled early and I am upset — I have the receipt right here';
  const region = `${bucketVector(refunderPreVector(msg), 3)}|${factsClass(extractRefunderFacts(msg), { kinds: REFUNDER_FREEZE_FACTS })}`;
  s.cells.find(c => c.id === 'refunder.frozen').table = {
    [region]: { class: 'full refund', n: 5, answer: RENDER['full refund'], evidence: ['test-injected mechanism proof'] },
  };
  const e = makeEngine(s, { backends: { 'deepinfra-chat:gpt-oss-20b': mockDeepinfra(counter) }, budget: { typesafe: 9, deepinfra: 9 } });
  const [t] = await e.runSession([msg]);
  assert.equal(t.answer_source, 'frozen-lookup', 'the fact-keyed frozen row served the moment');
  assert.equal(t.frozen.region, region, 'the region key carries the facts class');
  assert.equal(t.frozen.n, 5);
  assert.equal(counter.calls, 0, 'zero model calls when the frozen table covers the fact-keyed region');
});
