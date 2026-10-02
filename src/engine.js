// src/engine.js — the storefront quilt runner.
//
// WHAT THIS IS: a small reactive sheet runner in the quilt vocabulary — sensors,
// lookups, a ROUTER NEXUS (keyword rules first, soft-joint intent classification when
// no rule matches — the deliberate anti-decision-tree), listeners (hooks), an iterator
// (turn budget), drops (outputs). Soft-joint execution is DOGFOODED from
// quilt-softjoints (../quilt-softjoints/src/joint.js) — lanes consume each other.
//
// THE ARCHITECTURE STORY (one screen, zero-shot):
//
//   customer.message ──▶ intent.router ──▶ (hours|stock|prices|refund|greeter|fallback)
//        (sensor)          keyword nexus         lookup cells (the formulaic bulk)
//                          + softjoint when        ▲
//                          no rule matches         │ fallback refs
//   cart.state ────────▶ moment.vector ────────┘
//        (sensor)          (softjoint: reads the moment as a NAMED VECTOR)
//
//   listeners: on escalate → handoff notice. iterator: session.turns budget.
//   drop: reply + full trace (every turn receipts its route/vector/latency/tokens).
//
// Every ai-bearing cell carries a FALLBACK path to a lookup/formula cell: budget out,
// network down — the store still answers hours and prices. That is the fail-closed law.

import { runJoint, makeBackend } from '../../quilt-softjoints/src/joint.js';

export function makeEngine(sheet, { backends = {}, budget = {}, traceFile = null, fs = null } = {}) {
  const byId = new Map(sheet.cells.map(c => [c.id, c]));
  if (!byId.has('customer.message')) throw new Error('sheet needs a customer.message sensor');
  const trace = [];
  const remaining = { typesafe: budget.typesafe ?? 6, deepinfra: budget.deepinfra ?? 15, judge: budget.judge ?? 4 };

  function backendFor(cell) {
    const b = cell.backend || { type: 'local' };
    const key = b.type === 'typesafe-systemone' ? 'typesafe' : 'deepinfra';
    const cacheKey = `${b.type}:${b.model}`;
    if (!backends[cacheKey]) {
      const made = makeBackend(b);
      backends[cacheKey] = {
        ...made,
        async call(args) {
          if (remaining[key] <= 0) throw new Error(`budget exhausted: ${key}`);
          remaining[key] -= 1;
          return made.call(args);
        },
      };
    }
    return backends[cacheKey];
  }

  // ---- cell evaluators -------------------------------------------------------
  function evalLookup(cell, input) {
    const key = String(input[cell.inputs?.[0] || 'key'] ?? '');
    const hit = Object.prototype.hasOwnProperty.call(cell.table, key) ? cell.table[key] : cell.default;
    return { value: hit, source: 'lookup', route: cell.id };
  }

  async function evalSoftjoint(cell, moment) {
    // resolve declared inputs into the state (lane 66-e play-test finding: the
    // refunder needs the POLICY text in its moment, not just the message)
    const state = { message: moment.message ?? null, cart: moment.cart ?? null };
    for (const ref of cell.inputs || []) {
      const dep = byId.get(ref);
      if (dep?.kind === 'lookup') state[ref.replace(/[^a-z0-9]/gi, '-')] = dep.default ?? dep.table?.default ?? null;
    }
    const out = await runJoint(sheet, cell.id, { state, vector: moment.vector || null }, {
      backend: backendFor(cell),
      prompt: cell.prompt || cell.notes || `serve ${cell.id}`,
      cache: true,
    });
    return {
      value: out.answer,
      vector: out.vector || null,
      source: out.source,
      usage: out.usage || null,
      latency_ms: out.latency_ms || 0,
      confidence: out.confidence,
      route: cell.id,
      greeter: cell.greeter === true,
    };
  }

  // The router nexus: keyword rules FIRST (decision-tree layer, cheap and auditable),
  // then a soft-joint classifier for what the rules cannot see (the dynamic layer —
  // this is the exact "don't decompose completely into decision trees" requirement).
  async function evalRouter(cell, message) {
    const text = String(message || '').toLowerCase();
    for (const rule of cell.rules || []) {
      if (rule.any && rule.any.some(k => text.includes(k))) {
        return { route: rule.route, matched: { via: 'rule', rule: rule.any.join('|') } };
      }
    }
    if (cell.classifier) {
      const cj = byId.get(cell.classifier);
      if (!cj) throw new Error(`router classifier ${cell.classifier} missing`);
      const out = await evalSoftjoint(cj, { message, cart: null });
      const known = (cj.choices || []).includes(String(out.value)) ? String(out.value) : cell.defaultRoute;
      return { route: known, matched: { via: 'classifier', vector: out.vector, source: out.source, raw: out.value } };
    }
    return { route: cell.defaultRoute, matched: { via: 'default' } };
  }

  // ---- one turn ---------------------------------------------------------------
  async function turn(message, cartState, turnNo) {
    const t0 = Date.now();
    const step = { turn: turnNo, message, at_utc: new Date().toISOString() };

    const router = sheet.cells.find(c => c.kind === 'router');
    const r = await evalRouter(router, message);
    step.route = r.route;
    step.routed_via = r.matched.via;
    if (r.matched.vector) step.vector = r.matched.vector;

    const target = byId.get(r.route);
    if (!target) throw new Error(`router → unknown cell ${r.route}`);
    let result;
    if (target.kind === 'lookup') result = evalLookup(target, { [target.inputs?.[0] || 'key']: inferKey(target, message) });
    else if (target.kind === 'softjoint') result = await evalSoftjoint(target, { message, cart: cartState });
    else throw new Error(`route target ${r.route} has unsupported kind ${target.kind}`);

    // listeners (hooks): fire on the routed target, never block the reply
    const hooks = (sheet.cells.filter(c => c.kind === 'listener') || [])
      .filter(h => h.watch === r.route || h.watch === '*');
    const hookReceipts = hooks.map(h => ({ hook: h.id, action: h.action, fired: true }));

    step.reply = result.value;
    step.answer_source = result.source;
    if (result.vector) step.vector = result.vector;
    if (result.usage) step.usage = result.usage;
    if (result.latency_ms) step.latency_ms = result.latency_ms;
    if (result.greeter) step.greeter = true;
    if (hookReceipts.length) step.hooks = hookReceipts;
    step.turn_ms = Date.now() - t0;

    trace.push(step);
    if (traceFile && fs) {
      fs.mkdirSync(traceFile.replace(/\/[^/]+$/, ''), { recursive: true });
      fs.appendFileSync(traceFile, JSON.stringify(step) + '\n');
    }
    return step;
  }

  // inferKey: a tiny normalizer mapping a customer message to a lookup table key.
  // Kept EXPLICIT and table-driven (sheet-declared keywords) — this is lookup
  // territory; a model here would be the robotic failure mode the thesis warns about.
  function inferKey(cell, message) {
    const text = String(message || '').toLowerCase();
    if (cell.keymap) {
      for (const [kw, key] of Object.entries(cell.keymap)) {
        if (text.includes(kw)) return key;
      }
    }
    return cell.inputs?.[0] && cell.inputs[0] === 'key' ? text : 'default';
  }

  // ---- the session iterator ----------------------------------------------------
  return {
    async runSession(messages, { cartState = null } = {}) {
      const iterator = sheet.cells.find(c => c.kind === 'iterator');
      const maxTurns = iterator?.turns ?? messages.length;
      const out = [];
      for (let i = 0; i < Math.min(messages.length, maxTurns); i++) {
        out.push(await turn(messages[i], typeof cartState === 'function' ? cartState(i) : cartState, i + 1));
      }
      return out;
    },
    trace,
    budgetRemaining: remaining,
  };
}
