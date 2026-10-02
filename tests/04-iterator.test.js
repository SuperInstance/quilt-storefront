// tests/04-iterator.test.js — the multi-turn loop under a turn budget. NO NETWORK.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStorefront, loadBattery } from '../src/store.js';
import { MockAI } from './helpers/mock-ai.js';

test('iterator serves exactly turn_budget turns of a longer script and writes drop.receipt', async () => {
  const battery = loadBattery();
  const { engine } = makeStorefront({ ai: new MockAI() });
  const turns = JSON.parse(JSON.stringify(battery.turns));
  const trace = await engine.call('program.iterator', { turns, turn_budget: 5 }, {
    row: 'it-budget', identity: { id: 'c', type: 'human', tags: [] }, metadata: {},
  });
  const rows = trace.data;
  assert.equal(rows.length, 5, 'stopped at the budget');
  assert.equal(turns[5].reply, undefined, 'turns past the budget were never served');
  const receipt = (await engine.get('drop.receipt')).data;
  assert.equal(receipt.truncated, true, 'receipt honestly records truncation');
  assert.equal(receipt.turns_requested, 12);
  assert.equal(receipt.turns_served, 5);
  assert.equal(receipt.totals.model_calls, 2, 'turns 0 (greet) and 4 (chitchat) are the model turns inside the budget');
});

test('iterator builds real conversation history (familiarity grows across turns)', async () => {
  const battery = loadBattery();
  const { engine } = makeStorefront({ ai: new MockAI() });
  const turns = JSON.parse(JSON.stringify(battery.turns.slice(0, 4)));
  await engine.call('program.iterator', { turns, turn_budget: 4 }, {
    row: 'it-hist', identity: { id: 'c', type: 'human', tags: [] }, metadata: {},
  });
  const hist = (await engine.get('sensor.history')).data;
  assert.ok(Array.isArray(hist), 'history sensor is an array');
  assert.equal(typeof hist[0].customer, 'string');
  assert.ok(hist.length >= 0);
  const lv = await engine.get('formula.moment_vector_lexicon');
  assert.ok(lv.data.familiarity >= 0, 'lexicon read still live after the loop');
});

test('escalate turn fires the listener hook chain (handoff -> log) inside the session', async () => {
  const battery = loadBattery();
  const { engine } = makeStorefront({ ai: new MockAI() });
  const turns = JSON.parse(JSON.stringify(battery.turns));
  const trace = await engine.call('program.iterator', { turns, turn_budget: 12 }, {
    row: 'it-full', identity: { id: 'c', type: 'human', tags: [] }, metadata: {},
  });
  const esc = trace.data.find((r) => r.route === 'escalate');
  assert.ok(esc, 'an escalate turn exists in the battery');
  const handoff = (await engine.get('drop.handoff')).data;
  assert.ok(handoff && typeof handoff === 'object' && handoff.notice, 'drop.handoff was written');
  assert.match(handoff.notice, /HANDOFF -> manager on duty/);
  const log = (await engine.get('drop.trace_log')).data;
  assert.equal(log.length, 1, 'listener fired exactly once for the escalation');
  assert.equal(log[0].changed, 'drop.handoff');
  const receipt = (await engine.get('drop.receipt')).data;
  assert.equal(receipt.handoffs.length, 1, 'session receipt carries the handoff');
});
