// src/replay2.js — LIVE replay of the turns the 24-turn battery broke (lane 67-c).
//
// The battery (runs/live-session-2.jsonl) exposed three real defects; each was fixed
// in the sheet/engine and each affected turn is replayed here LIVE — corrections are
// new receipts (this file), never rewrites of the original trace:
//
//   T5  "…return these socks… I have the receipt"  → MISROUTED to stock.answer by rule
//       order (stock's broad "have" shadowed the specific refund intent). Fix: rule
//       order law (refund before stock). Replay proves the route + yields the missing
//       calm-factual refunder observation.
//   T6/T13 greeter fail-closed (null) → deepinfra joint truncated gpt-oss-20b at 400
//       max_tokens (reasoning model). Fix: storefront-native joint backend, 1200
//       tokens + tolerant JSON extraction. Replay goes DIRECT to the joint (the router
//       already proved itself on T6/T13; this verifies the backend only — and keeps
//       the replay inside the typesafe budget, since no classifier call is spent).
//   T22 refunder fallback served the raw string "fallback→refund-policy" to a
//       customer. Fix: the engine resolves a fallback ref to the referenced lookup
//       cell's value. Replay proves the joint succeeds under the fixed backend AND
//       yields the missing regular-customer refunder observation.
//
// Spend: 4 deepinfra calls, 0 typesafe. Appends to runs/live-session-2-replay.jsonl.
import fs from 'node:fs';
import { makeEngine } from './engine.js';
import { runJoint } from '../../quilt-softjoints/src/joint.js';
import { makeDeepinfraChatBackend } from './joint-backend.js';

const env = Object.fromEntries(
  fs.readFileSync('/home/z/my-project/.env.keys', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const sheet = JSON.parse(fs.readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
const TRACE = '/home/z/my-project/quilt-storefront/runs/live-session-2-replay.jsonl';

// ---- Part A: the two refund turns, through the FULL engine (router + joint) ----
const engine = makeEngine(sheet, {
  budget: { typesafe: 0, deepinfra: 20 }, // typesafe 0: replay must spend no classifier calls
  traceFile: TRACE,
  fs,
});
const refunds = [
  'I would like to return these socks please — they are unused and I have the receipt.', // replay of T5 (misroute fix + calm-factual register)
  'you know me, I am in here every week — this bread is stale, I would like to return it', // replay of T22 (fallback fix + regular-customer register)
];
const a = await engine.runSession(refunds);
for (const t of a) console.log(`refund replay: route=${t.route} via=${t.routed_via} src=${t.answer_source} ${String(t.reply).slice(0, 80)}`);

// ---- Part B: the two greeter turns, DIRECT to the joint (backend-fix verification) ----
const greeter = sheet.cells.find(c => c.id === 'greeter.voice');
const backend = makeDeepinfraChatBackend(greeter.backend);
const greetRows = [];
for (const [msg, replayOf] of [
  ['hey, good afternoon!', 6],
  ['good evening to you!', 13],
]) {
  const t0 = Date.now();
  const out = await runJoint(sheet, 'greeter.voice', { state: { message: msg, cart: null }, vector: null }, {
    backend,
    prompt: greeter.prompt,
    cache: false, // replays must really call; no cache masking
  });
  greetRows.push({
    kind: 'replay', replay_of: replayOf, message: msg,
    route: 'greeter.voice', routed_via: 'direct-joint (router already proved on T' + replayOf + ')',
    at_utc: new Date().toISOString(), turn_ms: Date.now() - t0,
    answer_source: out.source, reply: out.answer, vector: out.vector || null,
    usage: out.usage || null, latency_ms: out.latency_ms || null,
  });
  console.log(`greeter replay (of T${replayOf}): src=${out.source} ${String(out.answer).slice(0, 80)}`);
}

fs.appendFileSync(TRACE, greetRows.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log('budget remaining:', JSON.stringify(engine.budgetRemaining));
