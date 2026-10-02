// src/joint-backend.js — storefront-native deepinfra backend for soft joints (lane 67-c).
//
// WHY THIS EXISTS (live finding, runs/live-session-2.jsonl T6/T13/T22): quilt-softjoints'
// makeBackend deepinfra path hardcodes max_tokens: 400 and a brittle JSON slice-parse.
// gpt-oss-20b is a reasoning model — when reasoning + answer exceed 400 tokens the JSON
// truncates, parse fails, and the joint fail-closes (2 greeter silences + 1 raw
// "fallback→ref" string in one 24-turn session). quilt-softjoints is read-only for this
// lane, so the storefront supplies its OWN runJoint-compatible backend:
//   - same STRICT-JSON prompt contract (system + {moment, task} user turn) — behavior
//     identical, only headroom and parsing change;
//   - max_tokens 1200 (reasoning models need room to think before they answer);
//   - tolerant extraction (extractJson) that survives fences/prose around the JSON.
// Laws kept: budget wrapper stays in the engine; fail-closed stays in runJoint; keys
// runtime-only, never receipted.

import { chat as diChat } from './deepinfra.js';
import { extractJson } from './ai-adapter.js';

export function makeDeepinfraChatBackend(desc, { maxTokens = 1200 } = {}) {
  const model = desc?.model || 'gpt-oss-20b';
  // deepinfra ids are namespaced (openai/gpt-oss-20b) — mirror runJoint's auto-ns.
  const MODEL = model.includes('/') ? model
    : model.startsWith('granite') ? `ibm-granite/${model}`
    : model.startsWith('gpt-oss') ? `openai/${model}`
    : model.startsWith('Nemotron') ? `nvidia/${model}`
    : model.startsWith('Qwen') ? `Qwen/${model}`
    : model;
  return {
    type: 'deepinfra-chat',
    model,
    async call({ prompt, vectorLabels, state }) {
      const r = await diChat({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are one cell in a quilt — a small model at a soft joint. Read the moment as a vector, then answer. Reply with STRICT JSON: {"vector":{' + vectorLabels.map(l => `"${l}":0.0`).join(',') + '},"answer":"..."} — no other keys, no prose.' },
          { role: 'user', content: JSON.stringify({ moment: state, task: prompt }) },
        ],
        max_tokens: maxTokens,
      });
      const parsed = extractJson(r.content);
      if (!parsed || typeof parsed.answer === 'undefined') {
        throw new Error(`unparseable joint reply (${MODEL}, finish=${r.finish})`);
      }
      const vector = {};
      for (const l of vectorLabels) vector[l] = Number(parsed.vector?.[l] ?? 0.5);
      return {
        answer: String(parsed.answer),
        vector,
        confidence: 0.6,
        usage: r.usage,
        latency_ms: r.latency_ms,
        model,
      };
    },
  };
}
