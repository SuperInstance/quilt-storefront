// tests/06-vector.test.js — the vector vocabulary + typesafe answer parsing. NO NETWORK.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIMS, isVector, isDegenerate, blend, lexiconVector, zeroVector } from '../src/vector.js';
import { parseAnswer, parseAnswers } from '../src/typesafe.js';

test('DIMS are the four named dimensions of the moment', () => {
  assert.deepEqual([...DIMS].sort(), ['familiarity', 'frustration', 'urgency', 'warmth']);
});

test('isVector: shape gate', () => {
  assert.equal(isVector({ warmth: 0.1, urgency: 0.2, familiarity: 0.3, frustration: 0.4 }), true);
  assert.equal(isVector({ warmth: 1.2, urgency: 0.2, familiarity: 0.3, frustration: 0.4 }), false, 'out of range');
  assert.equal(isVector({ warmth: 'high', urgency: 0.2, familiarity: 0.3, frustration: 0.4 }), false, 'non-numeric dim');
  assert.equal(isVector(null), false);
  assert.equal(isVector([0.1, 0.2, 0.3, 0.4]), false, 'a NAMELESS array is not the moment vector');
});

test('isDegenerate: flat or malformed reads are untrustworthy', () => {
  assert.equal(isDegenerate({ warmth: 0.5, urgency: 0.5, familiarity: 0.5, frustration: 0.5 }), true, 'constant echo');
  assert.equal(isDegenerate({ warmth: 0.5, urgency: 0.51, familiarity: 0.5, frustration: 0.52 }), true, 'spread < 0.04');
  assert.equal(isDegenerate({ warmth: 0.1, urgency: 0.9, familiarity: 0.3, frustration: 0.5 }), false, 'a real read');
  assert.equal(isDegenerate(null), true);
});

test('blend: model 0.7 / lexicon 0.3, clamped', () => {
  const out = blend(
    { warmth: 1, urgency: 0, familiarity: 1, frustration: 0 },
    { warmth: 0, urgency: 1, familiarity: 0, frustration: 1 },
  );
  assert.deepEqual(out, { warmth: 0.7, urgency: 0.3, familiarity: 0.7, frustration: 0.3 });
  assert.deepEqual(blend(null, { warmth: 0.2, urgency: 0.2, familiarity: 0.2, frustration: 0.2 }), { warmth: 0.2, urgency: 0.2, familiarity: 0.2, frustration: 0.2 }, 'no model read -> pure lexicon');
  assert.deepEqual(blend(null, null), zeroVector());
});

test('lexiconVector: frustration and warmth read the message, not the void', () => {
  const angry = lexiconVector('This thing is BROKEN and I want it fixed today. Unacceptable.', 0);
  assert.ok(angry.frustration > 0.5, `frustration high (got ${angry.frustration})`);
  assert.ok(angry.urgency > 0.3, 'urgency elevated by "today"');
  const warm = lexiconVector('Hello, thank you for the wonderful store!', 3);
  assert.ok(warm.warmth > 0.6, `warmth high (got ${warm.warmth})`);
  assert.ok(lexiconVector('', 0).warmth < 0.5, 'silence stays neutral');
});

test('typesafe parseAnswer: proven wire shapes (probe 2026-10-02)', () => {
  const noul = parseAnswer({ type: 'noul', noul: 0.52 });
  assert.equal(noul.kind, 'noul');
  assert.equal(noul.value, 0.52);
  const choice = parseAnswer({ type: 'choice', choice: 'back', confidence: 0.49, probabilities: { a7: 0.02, back: 0.66, a3: 0.32 } });
  assert.equal(choice.kind, 'choice');
  assert.equal(choice.value, 'back');
  assert.equal(choice.confidence, 0.49);
  const score = parseAnswer({ type: 'score', score: 'decisive' });
  assert.equal(score.value, 'decisive');
  const raw = parseAnswer('weird');
  assert.equal(raw.kind, 'raw');
  const multi = parseAnswers({ vec_warmth: { type: 'noul', noul: 0.8 }, policy_decision: { type: 'choice', choice: 'within_30d_no_receipt', confidence: 0.6 } });
  assert.equal(multi.vec_warmth.value, 0.8);
  assert.equal(multi.policy_decision.value, 'within_30d_no_receipt');
});
