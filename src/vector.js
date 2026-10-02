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

// ---------------------------------------------------------------------------
// Refunder PRE-VECTOR (lane 67-c): a deterministic lexicon read of the refund
// moment in the refunder's OWN dims {distress, goodwill, repeat-customer},
// computable BEFORE any model call. Why it must exist: the refunder's post-call
// vector is only known AFTER the model answers — a frozen table keyed on it
// could never be consulted first. The grind-down law therefore keys frozen rows
// on this formula (sheet: refunder.joint.prevector = 'refunder-lexicon'), while
// the model's own (post) vector stays in the trace as freeze-audit context.
// Deliberately its OWN word lists, not the LEX above: in a refund moment the
// word "refund" is the TOPIC, not distress; "cracked/stale/ripped" are defect
// claims (mild distress), while "furious/unacceptable" are emotional intensity.
// ---------------------------------------------------------------------------
const RLEX = {
  distress: ['furious', 'angry', 'unacceptable', 'upset', 'frustrated', 'ridiculous', 'terrible', 'worst', 'useless', 'fed up', 'outraged', 'livid', 'appalled'],
  defect: ['broke', 'broken', 'spoiled', 'cracked', 'stale', 'ripped', 'leaked', 'mold', 'expired', 'damaged', 'defective'],
  goodwill: ['please', 'thank', 'appreciate', 'not your fault', 'understand', 'no rush', 'kind', 'patient', 'no worries', 'whenever'],
  repeat: ['every week', 'you know me', 'regular', 'my usual', 'usual', 'loyal', 'last time', 'again', 'daily', 'here all the time', 'come here all'],
  first_time: ['first time', 'first visit', 'new customer', 'just moved here'],
};

export function refunderPreVector(message) {
  const msg = String(message ?? '').toLowerCase();
  const hits = (list) => list.reduce((n, w) => n + (msg.includes(w) ? 1 : 0), 0);
  const sat = (n, base, step) => clamp01(base + step * Math.min(n, 3));
  // emotional intensity dominates distress; a bare defect claim adds a mild, capped bump
  const distress = clamp01(sat(hits(RLEX.distress), 0.05, 0.32) + Math.min(0.1, hits(RLEX.defect) * 0.05));
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    distress: r2(distress),
    goodwill: r2(sat(hits(RLEX.goodwill), 0.4, 0.2)),
    'repeat-customer': r2(clamp01(sat(hits(RLEX.repeat), 0.2, 0.3) - (hits(RLEX.first_time) > 0 ? 0.2 : 0))),
  };
}

// PREVECTOR REGISTRY: sheet cells name their pre-vector formula by id, the engine
// resolves it here. Keeping the mapping explicit (not magic) is lookup-territory law.
export const PREVECTORS = { 'refunder-lexicon': refunderPreVector };

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
