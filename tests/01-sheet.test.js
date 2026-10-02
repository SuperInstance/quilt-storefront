// tests/01-sheet.test.js — sheet instantiation against the vendored reactive engine.
// NO NETWORK: uses the mock AI adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStorefront, loadSheet } from '../src/store.js';
import { MockAI } from './helpers/mock-ai.js';

test('sheet parses and declares the full required cell census', () => {
  const sheet = loadSheet();
  const kinds = {};
  for (const c of sheet.cells) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  assert.ok(kinds.sensor >= 3, 'at least 3 sensor cells (message, cart, time-of-day)');
  assert.equal(kinds.router, 1, 'exactly one router nexus');
  assert.ok(kinds.value >= 4, 'at least 4 lookup tables');
  assert.ok(kinds.ai >= 2, 'at least 2 ai cells (typesafe + deepinfra)');
  assert.ok(kinds.program >= 4, 'softjoints + iterator + listener action');
  assert.ok(kinds.listener >= 1, 'at least one listener hook');
  const ids = new Set(sheet.cells.map((c) => c.id));
  for (const id of ['nexus.intent', 'softjoint.greeter', 'softjoint.refund', 'program.iterator',
    'ai.greeter.chat', 'ai.refund.judgment', 'answer.hours', 'answer.stock', 'answer.price',
    'answer.ood', 'drop.receipt', 'drop.handoff', 'listener.escalate_hook']) {
    assert.ok(ids.has(id), `required cell present: ${id}`);
  }
  assert.equal(sheet.cells.find((c) => c.id === 'softjoint.greeter').greeter, true, 'greeter flag set');
  assert.equal(sheet.softjoints?.find((s) => s.id === 'softjoint.greeter')?.greeter, true, 'greeter descriptor per §5b');
});

test('loadSheet instantiates every cell; lookups are ready; greeter + vector contract present', async () => {
  const { engine } = makeStorefront({ ai: new MockAI() });
  assert.equal(engine.listCells().length, loadSheet().cells.length, 'all cells registered');
  for (const id of ['lookup.hours', 'lookup.stock', 'lookup.price', 'lookup.refund_policy', 'lookup.templates']) {
    const v = await engine.get(id);
    assert.equal(v.status, 'ready', `${id} ready`);
    assert.ok(v.data && typeof v.data === 'object', `${id} carries a table`);
  }
  const timeband = await engine.get('formula.timeband');
  assert.equal(timeband.data, 'morning', 'default clock (sat 10:00) -> morning');
  const lv = await engine.get('formula.moment_vector_lexicon');
  for (const d of ['warmth', 'urgency', 'familiarity', 'frustration']) {
    assert.ok(typeof lv.data[d] === 'number' && lv.data[d] >= 0 && lv.data[d] <= 1, `lexicon vector dim ${d} in 0..1`);
  }
});

test('every ai cell has a fallback path declared (sheet law)', () => {
  const sheet = loadSheet();
  const sj = Object.fromEntries(sheet.softjoints.map((s) => [s.id, s]));
  for (const ai of sheet.cells.filter((c) => c.kind === 'ai')) {
    const owner = ai.id === 'ai.greeter.chat' ? 'softjoint.greeter' : 'softjoint.refund';
    assert.ok(sj[owner], `${ai.id} is owned by a softjoint`);
    assert.ok(sj[owner].fallback?.ref, `${ai.id} declares a fallback lookup ref`);
  }
});
