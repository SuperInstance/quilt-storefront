// src/typesafe.js — the receipted typesafe.ai systemone client for quilt-storefront.
//
// Adapted from the canonical client /home/z/my-project/fleet-seeds/lode/engine/systemone_client.mjs
// (lane 66-e, wave-66). Wire shape proven by jev-garden P-G6, the wave-48 r8 calibration
// battery, and THIS LANE's probe at 2026-10-02T03:55:01Z (receipt: receipts/raw/external-calls.jsonl):
//   POST https://api.typesafe.ai/v1/systemone {model, state:OBJECT, questions:OBJECT MAP}
//   -> {model, answers:{name:{type:'noul',noul:0..1} | {type:'choice',choice,confidence,probabilities}}, usage:{input_tokens,output_tokens}}
// Question types are TYPED DISTRIBUTIONS — there is NO free-text lane on the wire. The
// storefront uses this cell for JUDGMENTS (the moment vector + the refund decision);
// language is rendered from lookup tables by formula cells (the formulaic half).
//
// Laws (inherited):
//   - pricing-first: EVERY call returns a usage receipt; callers append it to receipts.
//   - fail-closed: non-2xx / unparseable -> throw with the HTTP status. No partial answers.
//   - key discipline: TYPESAFE_API_KEY runtime-only; never printed, never receipted.

export const BASE = 'https://api.typesafe.ai';

/**
 * One systemone call.
 * @param {{state: object, questions: Record<string, object>, model?: string, timeout_ms?: number}} args
 * @returns {Promise<{model_served: string, answers: object, usage: object|null, latency_ms: number, raw: object}>}
 */
export async function systemone({ state, questions, model = 'jev-latest', timeout_ms = 120_000 }) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error('TYPESAFE_API_KEY missing — typesafe channel closed (fail-closed)');
  const t0 = Date.now();
  const res = await fetch(`${BASE}/v1/systemone`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, state, questions }),
    signal: AbortSignal.timeout(timeout_ms),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // fail-closed: throw with status; message is key-safe (no credential is ever in it)
    const err = new Error(`systemone HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
    err.http = res.status;
    throw err;
  }
  return {
    model_served: body.model ?? model,
    answers: body.answers ?? null,
    usage: body.usage ?? null, // tokens of record (pricing-first)
    latency_ms: ms,
    raw: body, // caller persists what it needs
  };
}

/**
 * Tolerant extraction of typed-distribution answers into plain primitives.
 * noul  -> {kind:'noul', value: number 0..1}
 * choice-> {kind:'choice', value: string, confidence, probabilities}
 * score -> {kind:'score', value: label-or-number}
 * Unknown shapes pass through as {kind:'raw', value:<the raw answer>}.
 */
export function parseAnswer(a) {
  if (a == null) return { kind: 'raw', value: null };
  if (typeof a !== 'object') return { kind: 'raw', value: a };
  if (a.type === 'noul' || typeof a.noul === 'number') {
    return { kind: 'noul', value: clamp01(a.noul ?? a.p ?? a.value ?? 0) };
  }
  if (a.type === 'choice' || typeof a.choice === 'string') {
    return { kind: 'choice', value: a.choice ?? a.selected ?? a.value ?? null, confidence: a.confidence ?? null, probabilities: a.probabilities ?? null };
  }
  if (a.type === 'score' || a.score !== undefined) {
    return { kind: 'score', value: a.score ?? a.value ?? null };
  }
  return { kind: 'raw', value: a.value ?? a };
}

export function parseAnswers(answers) {
  const out = {};
  for (const [name, a] of Object.entries(answers ?? {})) out[name] = parseAnswer(a);
  return out;
}

function clamp01(n) { return Math.min(1, Math.max(0, Number(n) || 0)); }
