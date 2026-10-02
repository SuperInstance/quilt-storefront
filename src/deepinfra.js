// src/deepinfra.js — receipted deepinfra chat client (OpenAI-compatible) for quilt-storefront.
//
// Endpoint https://api.deepinfra.com/v1/openai/chat/completions (proven on this account by
// cot-quilt/scripts/clients.mjs; 183 models listed at /v1/openai/models, probe 2026-10-02).
// Models this lane rides: openai/gpt-oss-20b (cheap storefront voice), Qwen/Qwen3.8-27B (eval judge).
//
// Laws: pricing-first (usage receipt per call), fail-closed (non-2xx -> throw), key discipline
// (DEEPINFRA_API_KEY runtime-only; never printed, never receipted).

export const BASE = 'https://api.deepinfra.com/v1/openai';

/**
 * One chat completion.
 * @param {{model: string, messages: Array<{role: string, content: string}>, temperature?: number, max_tokens?: number, timeout_ms?: number}} args
 */
export async function chat({ model, messages, temperature = 0.5, max_tokens = 500, timeout_ms = 90_000 }) {
  const key = process.env.DEEPINFRA_API_KEY;
  if (!key) throw new Error('DEEPINFRA_API_KEY missing — deepinfra channel closed (fail-closed)');
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
    signal: AbortSignal.timeout(timeout_ms),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`deepinfra HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
    err.http = res.status;
    throw err;
  }
  return {
    model_served: body.model ?? model,
    content: body.choices?.[0]?.message?.content ?? null,
    finish: body.choices?.[0]?.finish_reason ?? null,
    usage: body.usage ?? null,
    latency_ms: ms,
  };
}

/** List model ids (a GET — no completion spent; still receipted by callers). */
export async function models(timeout_ms = 30_000) {
  const key = process.env.DEEPINFRA_API_KEY;
  if (!key) throw new Error('DEEPINFRA_API_KEY missing — deepinfra channel closed (fail-closed)');
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeout_ms) });
  if (!res.ok) throw new Error(`deepinfra models HTTP ${res.status}`);
  const body = await res.json();
  return (body.data ?? []).map((m) => m.id);
}
