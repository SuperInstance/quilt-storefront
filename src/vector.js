// src/vector.js — the moment as a VECTOR, not a value array.
//
// The principal's law for this artifact: the dynamic model cells must understand the
// moment as a vector array {warmth, urgency, familiarity, frustration} (each 0..1),
// read BEFORE the answer. This module owns the vector vocabulary:
//   - DIMS: the named dimensions (shared contract across sheet, adapter, trace, eval)
//   - isVector / isDegenerate: shape + quality gates applied to every model-returned
//     vector (degenerate reads are blended down to the lexicon estimator, never trusted)
//   - lexiconVector: the formulaic fallback estimator (keyword lexicon) used when the
//     model call is out of budget / offline / returned a degenerate vector
//   - blend: model vector is trusted 0.7, lexicon anchors 0.3, result clamped to 0..1

export const DIMS = ['warmth', 'urgency', 'familiarity', 'frustration'];

export function isVector(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
    && DIMS.every((d) => typeof v[d] === 'number' && Number.isFinite(v[d]) && v[d] >= 0 && v[d] <= 1);
}

/**
 * A vector is DEGENERATE when it cannot be trusted as a read of the moment:
 * any dim non-finite/out-of-range, or all four dims identical (the model echoed a
 * constant instead of reading the moment), or total spread < 0.04 (a flat line
 * carries no information). Degenerate != invalid: it means "do not ride this".
 */
export function isDegenerate(v) {
  if (!isVector(v)) return true;
  const vals = DIMS.map((d) => v[d]);
  const spread = Math.max(...vals) - Math.min(...vals);
  return spread < 0.04;
}

export function clamp01(n) { return Math.min(1, Math.max(0, n)); }

export function blend(modelVector, lexiconVector, wModel = 0.7) {
  const l = isVector(lexiconVector) ? lexiconVector : zeroVector();
  if (!isVector(modelVector)) return { ...l };
  const out = {};
  for (const d of DIMS) out[d] = Math.round(clamp01(wModel * modelVector[d] + (1 - wModel) * l[d]) * 100) / 100;
  return out;
}

export function zeroVector() {
  return Object.fromEntries(DIMS.map((d) => [d, 0]));
}

// ---------------------------------------------------------------------------
// The lexicon estimator — the FORMULAIC fallback read of the moment.
// Small, deterministic, transparent. It is the graceful-degradation path for BOTH
// dynamic cells (greeter + refund judge) and lives again in the sheet as
// formula.moment_vector_lexicon (sheet copy is the cell; this copy serves the
// adapter-side tests and the eval baseline). Keep the two lexicons in sync.
// ---------------------------------------------------------------------------
const LEX = {
  urgency: ['now', 'today', 'asap', 'urgent', 'quick', 'hurry', 'right away', 'immediately', 'closing', 'before'],
  warmth: ['hi', 'hello', 'hey', 'thanks', 'thank you', 'please', 'good morning', 'good afternoon', 'good evening', 'appreciate', 'favorite', 'love', 'nice', 'wonderful', 'howdy'],
  familiarity: ['again', 'usual', 'same as last', 'back', 'my usual', 'remember', 'last time', 'regular'],
  frustration: ['broken', 'broke', 'unacceptable', 'angry', 'ridiculous', 'furious', 'terrible', 'worst', 'refund', 'manager', 'human', 'fed up', 'joke', 'waste', 'useless', 'never again', 'complaint'],
};

export function lexiconVector(message, historyLen = 0) {
  const msg = String(message ?? '').toLowerCase();
  const hits = {};
  for (const [dim, words] of Object.entries(LEX)) {
    let n = 0;
    for (const w of words) if (msg.includes(w)) n += 1;
    hits[dim] = n;
  }
  // saturating mapping: 0 hits -> base, each hit adds, saturation at ~3 hits
  const sat = (n, base, step) => clamp01(base + step * Math.min(n, 3));
  return {
    warmth: sat(hits.warmth, 0.35, 0.2),
    urgency: sat(hits.urgency, 0.15, 0.28),
    familiarity: sat(hits.familiarity, Math.min(0.3, historyLen * 0.1), 0.2),
    frustration: sat(hits.frustration, 0.05, 0.3),
  };
}
