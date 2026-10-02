// tests/helpers/mock-ai.js — a deterministic, offline AI adapter for tests.
// Mirrors the VALUE SHAPES of src/ai-adapter.js exactly (that IS the contract the
// softjoints ride): deepinfra-chat -> {reply, vector, vector_degenerate, usage,
// latency_ms, model_served}; typesafe-systemone -> {answers_raw, answers_parsed,
// vector, vector_degenerate, decision, usage, latency_ms, model_served}.
// `failAll` forces every call to throw (fallback-path drills).

export class MockAI {
  constructor({ failAll = false, degenerateVector = false } = {}) {
    this.failAll = failAll;
    this.degenerateVector = degenerateVector;
    this.calls = [];
  }
  async call(config) {
    this.calls.push({ id: config.id, provider: config.provider });
    if (this.failAll) throw new Error(`mock failAll: ${config.id} forced to fail`);
    const vector = this.degenerateVector
      ? { warmth: 0.5, urgency: 0.5, familiarity: 0.5, frustration: 0.5 }
      : { warmth: 0.8, urgency: 0.1, familiarity: 0.4, frustration: 0.05 };
    if (config.provider === 'deepinfra-chat') {
      return {
        reply: 'Well hello, neighbor - grab a warm cup while you browse.',
        vector,
        vector_degenerate: this.degenerateVector,
        raw_content: '{"vector":' + JSON.stringify(vector) + ',"reply":"Well hello, neighbor - grab a warm cup while you browse."}',
        usage: { input_tokens: 42, output_tokens: 17 },
        latency_ms: 3,
        model_served: 'mock-greeter',
        finish: 'stop',
      };
    }
    if (config.provider === 'typesafe-systemone') {
      const parsed = {
        vec_warmth: { kind: 'noul', value: vector.warmth },
        vec_urgency: { kind: 'noul', value: vector.urgency },
        vec_familiarity: { kind: 'noul', value: vector.familiarity },
        vec_frustration: { kind: 'noul', value: vector.frustration },
        policy_decision: { kind: 'choice', value: 'defective_or_damaged', confidence: 0.7, probabilities: null },
      };
      return {
        answers_raw: { policy_decision: { type: 'choice', choice: 'defective_or_damaged', confidence: 0.7 } },
        answers_parsed: parsed,
        vector,
        vector_degenerate: this.degenerateVector,
        decision: { key: 'defective_or_damaged', confidence: 0.7, probabilities: null },
        usage: { input_tokens: 321, output_tokens: 58 },
        latency_ms: 5,
        model_served: 'jev-1.13.0-mock',
      };
    }
    throw new Error('mock ai: unknown provider ' + config.provider);
  }
}
