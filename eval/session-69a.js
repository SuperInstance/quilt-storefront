// eval/session-69a.js — THE LIVE REFUNDER SESSION (lane 69-a, the deferred loop).
//
// One LIVE 24-turn refunder-region session: every turn is a customer refund moment
// (eval/battery-69a.json, pre-registered + dry-run-verified) routed through the v2
// pipeline: router rule (free) → extraction pre-step (free) → factRequired gate (free)
// → frozen lookup (EMPTY at run time — every grounded moment reaches the model)
// → refunder.joint deepinfra call (8 turns) / routed E_FACTS_REQUIRED ask-back (15)
// / in-session cache (1, T18 repeats T04 verbatim).
//
// Budgets (mission cap ≤8 external calls TOTAL): typesafe 0 (the classifier can never
// spend — router rules route every turn; a rule-miss would fail closed, receipted),
// deepinfra exactly 8 (a 9th grounded turn would fail closed to the policy lookup,
// receipted — it cannot happen silently).
//
// Trace → runs/live-session-3.jsonl (FRESH — unlinked first, append-only during the run).
// SPEND tally printed at the end from per-call usage (provider, model, purpose, tokens).
import fs from 'node:fs';
import { makeEngine } from '../src/engine.js';

const env = Object.fromEntries(
  fs.readFileSync('/home/z/my-project/.env.keys', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const sheet = JSON.parse(fs.readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
const battery = JSON.parse(fs.readFileSync(new URL('./battery-69a.json', import.meta.url), 'utf8'));

const TRACE = new URL('../runs/live-session-3.jsonl', import.meta.url).pathname;
fs.rmSync(TRACE, { force: true }); // fresh trace — this lane's run, no stale rows

const SESSION = battery.turns.map(t => t.message);
const engine = makeEngine(sheet, {
  budget: { typesafe: 0, deepinfra: 8 },
  traceFile: TRACE,
  fs,
});
const turns = await engine.runSession(SESSION);

console.log('ROUTE SUMMARY');
const tally = {};
for (const t of turns) tally[`${t.route}@${t.routed_via}`] = (tally[`${t.route}@${t.routed_via}`] || 0) + 1;
console.log(JSON.stringify(tally, null, 1));
for (const t of turns) {
  const src = String(t.answer_source);
  const mark = t.fact_refused ? `E_FACTS_REQUIRED→${t.routed_to}` : (t.frozen ? `FROZEN ${t.frozen.region}` : '');
  console.log(`T${String(t.turn).padStart(2)} ${src.padEnd(16)} ${String(t.reply ?? '').slice(0, 84)} ${mark}`);
}

// SPEND receipt (provider, model, purpose, tokens)
const calls = turns.filter(t => t.answer_source === 'deepinfra-chat');
const failed = turns.filter(t => t.fallback_reason?.startsWith('backend-failed'));
let tin = 0, tout = 0;
for (const t of calls) { tin += t.usage?.prompt_tokens ?? 0; tout += t.usage?.completion_tokens ?? 0; }
console.log('\nSPEND: deepinfra gpt-oss-20b (refunder.joint rulings): '
  + `${calls.length} ok / ${failed.length} failed · tokens_in=${tin} tokens_out=${tout}`);
console.log('cache hits:', turns.filter(t => t.answer_source === 'cache').length,
  '· fact-refused (ask-back):', turns.filter(t => t.fact_refused).length);
console.log('budget remaining:', JSON.stringify(engine.budgetRemaining));
console.log('trace:', TRACE, `(${turns.length} turns)`);
