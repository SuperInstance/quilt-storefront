// tests/02-router.test.js — nexus determinism on fixtures, including the two
// caller-aware behaviors: identity-tag routing and vector-hint routing. NO NETWORK.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStorefront, loadBattery } from '../src/store.js';
import { MockAI } from './helpers/mock-ai.js';

async function routeOf(engine, message, { tags = ['new'], vector_hint = null, row = 'fixture' } = {}) {
  // mirror the iterator's per-turn contract: sensors are pushed BEFORE the nexus call
  await engine.set('sensor.customer_message', message);
  await engine.set('sensor.history', []);
  await engine.set('sensor.cart', { items: [] });
  const res = await engine.call('nexus.intent', { message }, {
    row,
    identity: { id: 'fixture-customer', type: 'human', tags },
    metadata: { message, turn: 0, vector_hint },
  });
  assert.equal(res.status, 'ready', `router answered ready for: ${message}`);
  return res.data;
}

test('every battery turn routes to its expected route (deterministic fixtures)', async () => {
  const battery = loadBattery();
  const { engine } = makeStorefront({ ai: new MockAI() });
  let i = 0;
  for (const t of battery.turns) {
    const out = await routeOf(engine, t.message, {
      tags: i >= 2 ? ['returning'] : ['new'],
      vector_hint: { warmth: 0.4, urgency: 0.1, familiarity: 0.3, frustration: 0.1 },
      row: `fixture-${t.id}`,
    });
    assert.equal(out.route, t.expect_route, `${t.id}: "${t.message}" -> ${t.expect_route} (got ${out.route})`);
    if (t.expect_route === 'refund' || t.expect_route === 'greet' || t.expect_route === 'chitchat') {
      assert.equal(out.source, 'model', `${t.id}: dynamic route answered by the model (mock)`);
    } else {
      assert.equal(out.source, 'formula', `${t.id}: formulaic route answered by the tables`);
    }
    i += 1;
  }
});

test('router determinism: same fixture, same route, byte-stable answer (formula routes)', async () => {
  const { engine } = makeStorefront({ ai: new MockAI() });
  const a = await routeOf(engine, 'What time do you open on Saturdays?');
  const b = await routeOf(engine, 'What time do you open on Saturdays?');
  assert.equal(a.answer, b.answer);
  assert.equal(a.route, 'hours');
  assert.match(a.answer, /9:00/);
  assert.match(a.answer, /21:00/);
});

test('CALLER-AWARE: the same message routes by identity tags (returning shorthand)', async () => {
  const { engine } = makeStorefront({ ai: new MockAI() });
  const returning = await routeOf(engine, 'Back again - the usual, please.', { tags: ['returning'] });
  assert.equal(returning.route, 'chitchat', 'a known regular saying "the usual" reaches the relationship surface');
  const stranger = await routeOf(engine, 'Back again - the usual, please.', { tags: ['new'] });
  assert.equal(stranger.route, 'ood', 'an unknown caller saying "the usual" falls through to the graceful ood reply');
});

test('VECTOR-AWARE: the same message routes by the moment vector (frustration hint)', async () => {
  const { engine } = makeStorefront({ ai: new MockAI() });
  const calm = await routeOf(engine, 'The seed spreader lid is stuck.', {
    vector_hint: { warmth: 0.4, urgency: 0.2, familiarity: 0.3, frustration: 0.1 },
  });
  assert.equal(calm.route, 'ood', 'a calm moment does NOT escalate');
  const cross = await routeOf(engine, 'The seed spreader lid is stuck.', {
    vector_hint: { warmth: 0.1, urgency: 0.9, familiarity: 0.5, frustration: 0.9 },
  });
  assert.equal(cross.route, 'escalate', 'a frustrated moment escalates on the vector alone (regex does not match this message)');
});

test('route priority: refund beats stock for a broken-goods message', async () => {
  const { engine } = makeStorefront({ ai: new MockAI() });
  const out = await routeOf(engine, 'Do you have a box for this return? The kettle arrived damaged.');
  assert.equal(out.route, 'refund');
});

test('formulaic answers carry verified table facts', async () => {
  const { engine } = makeStorefront({ ai: new MockAI() });
  const stock = await routeOf(engine, 'Do you have bird seed for the feeder?');
  assert.match(stock.answer, /Aisle 3/);
  assert.match(stock.answer, /8\.50/);
  const miss = await routeOf(engine, 'Got any toaster parts? Ours quit heating.');
  assert.match(miss.answer, /Not on our shelves/i);
  const price = await routeOf(engine, 'And how much is the bird seed?');
  assert.match(price.answer, /8\.50/);
  const ood = await routeOf(engine, "What's the capital of France?");
  assert.match(ood.answer, /past our counter/i);
});
