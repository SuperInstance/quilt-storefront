// src/ai-adapter.js — the AI engine that plugs into the vendored quilt runtime.
//
// The engine's AI cells (`kind: 'ai'`) call `options.ai.call(config, {useCache})`
// (see vendor/quilt-engine/cells/ai.js). This adapter dispatches on `config.provider`:
//
//   'typesafe-systemone' — jev reads the moment as TYPED DISTRIBUTIONS (4 noul vector
//                           dims + 1 policy choice). No free-text lane on that wire;
//                           language is rendered from lookup tables by the softjoint.
//   'deepinfra-chat'     — the cheap model carries the storefront's voice (greeter),
//                           prompt required to emit {vector, reply} strict JSON.
//
// LAWS: budgeted (hard caps per provider — exceeding throws BudgetExhaustedError so
// the sheet's fallback path degrades gracefully), receipted (every external call lands
// in receipts/raw/external-calls.jsonl, failures included), fail-closed, key-safe.

import { systemone, parseAnswers } from './typesafe.js';
import { chat as deepinfraChat } from './deepinfra.js';
import { isVector, isDegenerate } from './vector.js';
import { record } from './telemetry.js';

export class BudgetExhaustedError extends Error {
  constructor(provider, spent, budget) {
    super(`budget exhausted for ${provider} (${spent}/${budget} calls spent) — softjoint must take its fallback path`);
    this.name = 'BudgetExhaustedError';
  }
}

export class StorefrontAI {
  /**
   * @param {{budgets?: Record<string, number>, failAll?: boolean}} opts
   *  failAll: test hook — every call throws without touching the network.
   */
  constructor({ budgets = { 'typesafe-systemone': 6, 'deepinfra-chat': 15 }, failAll = false } = {}) {
    this.budgets = budgets;
    this.spent = { 'typesafe-systemone': 0, 'deepinfra-chat': 0 };
    this.failAll = failAll;
  }

  /** The engine-facing entry point. Returns the AI cell's VALUE (see vendor ai.js). */
  async call(config) {
    const provider = config.provider;
    if (!this.spent.hasOwnProperty(provider)) this.spent[provider] = 0;
    if (this.failAll) {
      record({ provider, cell: config.id, model: config.model, ok: false, external: false, error: 'failAll (test/fallback drill)' });
      throw new Error(`failAll adapter: ${config.id} forced to fail`);
    }
    if (this.spent[provider] >= (this.budgets[provider] ?? 0)) {
      record({ provider, cell: config.id, model: config.model, ok: false, external: false, error: `budget exhausted (${this.spent[provider]}/${this.budgets[provider]})` });
      throw new BudgetExhaustedError(provider, this.spent[provider], this.budgets[provider] ?? 0);
    }
    this.spent[provider] += 1;
    try {
      const value = provider === 'typesafe-systemone'
        ? await this.callTypesafe(config)
        : provider === 'deepinfra-chat'
          ? await this.callDeepinfra(config)
          : throwErr(`unknown ai provider: ${provider}`);
      record({ provider, cell: config.id, model: value.model_served ?? config.model, ok: true, usage: value.usage, latency_ms: value.latency_ms });
      return value;
    } catch (e) {
      record({ provider, cell: config.id, model: config.model, ok: false, error: String(e?.message || e).slice(0, 200) });
      throw e;
    }
  }

  /** typesafe systemone: the moment as typed distributions + the policy judgment. */
  async callTypesafe(config) {
    const questions = typeof config.questions_json === 'string'
      ? JSON.parse(config.questions_json)
      : throwErr('typesafe ai cell is missing its questions_json string field');
    const r = await systemone({
      state: { battery: 'quilt-storefront', cell: config.id, moment: String(config.prompt ?? '') },
      questions,
      model: config.model ?? 'jev-latest',
    });
    const parsed = parseAnswers(r.answers);
    const vector = {
      warmth: parsed.vec_warmth?.value,
      urgency: parsed.vec_urgency?.value,
      familiarity: parsed.vec_familiarity?.value,
      frustration: parsed.vec_frustration?.value,
    };
    return {
      answers_raw: r.answers,
      answers_parsed: parsed,
      vector: isVector(vector) ? vector : null,
      vector_degenerate: isVector(vector) ? isDegenerate(vector) : true,
      decision: parsed.policy_decision
        ? { key: parsed.policy_decision.value, confidence: parsed.policy_decision.confidence ?? null, probabilities: parsed.policy_decision.probabilities ?? null }
        : null,
      usage: r.usage,
      latency_ms: r.latency_ms,
      model_served: r.model_served,
    };
  }

  /** deepinfra chat: the storefront's voice. Prompt law: vector read BEFORE the reply. */
  async callDeepinfra(config) {
    const r = await deepinfraChat({
      model: config.model,
      messages: [
        { role: 'system', content: String(config.system ?? '') },
        { role: 'user', content: String(config.prompt ?? '') },
      ],
      temperature: config.temperature ?? 0.6,
      max_tokens: config.max_tokens ?? 240,
    });
    const parsed = extractJson(r.content);
    const vector = parsed && typeof parsed === 'object' ? parsed.vector : null;
    return {
      reply: parsed && typeof parsed === 'object' && typeof parsed.reply === 'string'
        ? parsed.reply
        : (typeof parsed === 'string' ? parsed : null),
      raw_content: r.content,
      vector: isVector(vector) ? vector : null,
      vector_degenerate: isVector(vector) ? isDegenerate(vector) : true,
      usage: r.usage,
      latency_ms: r.latency_ms,
      model_served: r.model_served,
      finish: r.finish,
    };
  }
}

function throwErr(msg) { throw new Error(msg); }

/**
 * Pull the first JSON value (object or array) out of model text — tolerates
 * markdown fences and leading prose. Returns null when nothing parses.
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const i = cleaned.indexOf(open);
    const j = cleaned.lastIndexOf(close);
    if (i !== -1 && j > i) {
      try { return JSON.parse(cleaned.slice(i, j + 1)); } catch { /* keep trying */ }
    }
  }
  return null;
}
