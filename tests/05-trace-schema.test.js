// tests/05-trace-schema.test.js — the session trace conforms to the schema contract.
// NO NETWORK (mock adapter).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStorefront, loadBattery } from '../src/store.js';
import { MockAI } from './helpers/mock-ai.js';

const SOURCES = ['model', 'fallback', 'formula']; // 'formula' is the honest superset of 'model'|'fallback'
const DIMS = ['warmth', 'urgency', 'familiarity', 'frustration'];

test('full 12-turn trace: schema conformance on every row', async () => {
  const battery = loadBattery();
  const { engine } = makeStorefront({ ai: new MockAI() });
  const turns = JSON.parse(JSON.stringify(battery.turns));
  const trace = await engine.call('program.iterator', { turns, turn_budget: 12 }, {
    row: 'it-schema', identity: { id: 'c', type: 'human', tags: [] }, metadata: {},
  });
  const rows = trace.data;
  assert.equal(rows.length, 12);
  let i = 0;
  for (const row of rows) {
    assert.equal(typeof row.turn, 'number', `row ${i}: turn is an int`);
    assert.equal(row.turn, i, `row ${i}: turn is the ordinal`);
    assert.equal(typeof row.route, 'string', `row ${i}: route is a string`);
    assert.ok(SOURCES.includes(row.source), `row ${i}: source '${row.source}' is model|fallback|formula`);
    assert.equal(typeof row.latency_ms, 'number', `row ${i}: latency_ms recorded`);
    assert.ok(row.latency_ms >= 0, `row ${i}: latency_ms non-negative`);
    assert.ok(row.tokens === null || (typeof row.tokens === 'object' && row.tokens !== null), `row ${i}: tokens null|object`);
    assert.ok(typeof row.answer === 'string' && row.answer.length > 0, `row ${i}: answer present`);
    // vector: 4 named dims, each 0..1 (the moment as a VECTOR ARRAY, not a value array)
    assert.ok(row.vector && typeof row.vector === 'object', `row ${i}: vector present`);
    for (const d of DIMS) {
      const x = row.vector[d];
      assert.ok(typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1, `row ${i}: vector.${d} in 0..1 (got ${x})`);
    }
    i += 1;
  }
});

test('session receipt schema: totals reconcile with the trace rows', async () => {
  const battery = loadBattery();
  const { engine } = makeStorefront({ ai: new MockAI() });
  const turns = JSON.parse(JSON.stringify(battery.turns));
  const trace = await engine.call('program.iterator', { turns, turn_budget: 12 }, {
    row: 'it-receipt', identity: { id: 'c', type: 'human', tags: [] }, metadata: {},
  });
  const rows = trace.data;
  const receipt = (await engine.get('drop.receipt')).data;
  assert.equal(receipt.kind, 'session-receipt');
  assert.equal(receipt.turns_served, rows.length);
  assert.equal(receipt.totals.model_calls, rows.filter((r) => r.source === 'model').length);
  assert.equal(receipt.totals.fallback_calls, rows.filter((r) => r.source === 'fallback').length);
  assert.equal(receipt.totals.formula_calls, rows.filter((r) => r.source === 'formula').length);
  const tokenSum = rows.reduce((s, r) => s + ((r.tokens?.input_tokens ?? 0) + (r.tokens?.output_tokens ?? r.tokens?.completion_tokens ?? 0)), 0);
  assert.equal(receipt.totals.tokens_in + receipt.totals.tokens_out, tokenSum, 'token ledger reconciles with per-turn tokens');
});
