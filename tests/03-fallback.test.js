// tests/03-fallback.test.js — every ai cell's graceful degradation path. NO NETWORK.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStorefront, loadBattery } from '../src/store.js';
import { MockAI } from './helpers/mock-ai.js';
import { StorefrontAI, BudgetExhaustedError } from '../src/ai-adapter.js';

const battery = loadBattery();
const refundTurn = battery.turns.find((t) => t.expect_route === 'refund');

async function seedTurn(engine, message) {
  await engine.set('sensor.customer_message', message);
  await engine.set('sensor.clock', { weekday: 'sat', hour: 11, minute: 30 });
  await engine.set('sensor.history', []);
  await engine.set('sensor.cart', { items: [] });
}

test('greeter falls back to lookup.templates + lexicon vector when the model backend fails', async () => {
  const { engine } = makeStorefront({ ai: new MockAI({ failAll: true }) });
  await seedTurn(engine, 'Hello there!');
  const res = await engine.call('nexus.intent', { message: 'Hello there!' }, {
    row: 'fb-greet', identity: { id: 'c', type: 'human', tags: ['new'] }, metadata: { message: 'Hello there!' },
  });
  assert.equal(res.status, 'ready');
  assert.equal(res.data.route, 'greet');
  assert.equal(res.data.source, 'fallback', 'answer marked honestly as fallback');
  assert.ok(res.data.fallback_reason, 'fallback reason recorded');
  assert.match(res.data.answer, /welcome in/, 'greet_fallback template served');
  const v = res.data.vector;
  for (const d of ['warmth', 'urgency', 'familiarity', 'frustration']) {
    assert.ok(typeof v[d] === 'number' && v[d] >= 0 && v[d] <= 1, `fallback vector still reads the moment (${d})`);
  }
});

test('refund falls back to the posted policy rule when jev is unreachable', async () => {
  const { engine } = makeStorefront({ ai: new MockAI({ failAll: true }) });
  await seedTurn(engine, refundTurn.message);
  const res = await engine.call('nexus.intent', { message: refundTurn.message }, {
    row: 'fb-refund', identity: { id: 'c', type: 'human', tags: ['new'] }, metadata: { message: refundTurn.message },
  });
  assert.equal(res.data.route, 'refund');
  assert.equal(res.data.source, 'fallback');
  assert.match(res.data.answer, /Full refund to your original payment within 30 days, with the receipt/, 'policy table text served verbatim');
});

test('budget exhaustion degrades gracefully (BudgetExhaustedError -> fallback, not crash)', async () => {
  const { engine, ai } = makeStorefront({ budgets: { 'typesafe-systemone': 0, 'deepinfra-chat': 0 } });
  await seedTurn(engine, 'Hello there!');
  const res = await engine.call('nexus.intent', { message: 'Hello there!' }, {
    row: 'fb-budget', identity: { id: 'c', type: 'human', tags: ['new'] }, metadata: { message: 'Hello there!' },
  });
  assert.equal(res.data.source, 'fallback');
  assert.match(res.data.fallback_reason, /budget exhausted/);
  assert.equal(ai.spent['deepinfra-chat'], 0, 'no external call was spent past the cap');
  await assert.rejects(
    () => new StorefrontAI({ budgets: { 'deepinfra-chat': 0 } }).call({ provider: 'deepinfra-chat', id: 'x', model: 'm' }),
    BudgetExhaustedError,
  );
});

test('a DEGENERATE model vector (flat dims) is discarded for the lexicon read', async () => {
  const { engine } = makeStorefront({ ai: new MockAI({ degenerateVector: true }) });
  await seedTurn(engine, 'Hello there!');
  const res = await engine.call('nexus.intent', { message: 'Hello there!' }, {
    row: 'fb-degen', identity: { id: 'c', type: 'human', tags: ['new'] }, metadata: { message: 'Hello there!' },
  });
  assert.equal(res.data.source, 'model', 'the answer still came from the model');
  assert.equal(res.data.vector_degenerate, true, 'the vector read was flagged degenerate');
  assert.notDeepEqual(res.data.vector, { warmth: 0.5, urgency: 0.5, familiarity: 0.5, frustration: 0.5 }, 'flat vector replaced by the lexicon read');
});
