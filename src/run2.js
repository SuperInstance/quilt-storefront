// src/run2.js — the BIGGER live play-test battery (lane 67-c).
//
// Wave-66's 12-turn session was too small for the freezing test to see anything:
// only two refund observations, two registers. This battery doubles the session to
// 24 turns so the soft joints get real pressure:
//   - every route served >= 3 times (hours, stock, prices, refund, escalate,
//     greeter via classifier, fallback/ood via classifier)
//   - FIVE refund registers: calm-factual / upset / furious-but-polite /
//     regular-customer / first-timer  → the refunder's freeze-test dataset
//   - greeter at three different times of day
//   - three out-of-domain turns
// Trace → runs/live-session-2.jsonl (append-only; adjustments → runs/adjustments.jsonl).
// Budgets (task §1): typesafe ≤ 6 (classifier), deepinfra ≤ 20 (joints + greeter).
import fs from 'node:fs';
import { makeEngine } from './engine.js';

const env = Object.fromEntries(
  fs.readFileSync('/home/z/my-project/.env.keys', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const sheet = JSON.parse(fs.readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));

const SESSION = [
  'good morning!',                                                    // T01 greeter (classifier) — morning
  'what are your hours on saturday?',                                 // T02 hours (rule)
  'do you have milk?',                                                // T03 stock (rule)
  'how much are eggs?',                                               // T04 prices (rule)
  'I would like to return these socks please — they are unused and I have the receipt.', // T05 refund: calm-factual
  'hey, good afternoon!',                                             // T06 greeter (classifier) — afternoon
  'what time do you open on sunday?',                                 // T07 hours (rule)
  'do you carry oat flour?',                                          // T08 stock miss (rule default)
  'how much for bread?',                                              // T09 prices (rule)
  'the milk I bought yesterday spoiled early and I am upset about it', // T10 refund: upset
  'i want to speak to a manager',                                     // T11 escalate (rule)
  'can I bring my dog in?',                                           // T12 out-of-domain (classifier)
  'good evening to you!',                                             // T13 greeter (classifier) — evening
  'are you open on tuesday?',                                         // T14 hours (rule)
  'do you have bread?',                                               // T15 stock (rule)
  'what is the cost of milk?',                                        // T16 prices (rule)
  'the toaster I bought here broke on day one and honestly I am furious — but I know it is not your fault, and I would appreciate whatever you can do.', // T17 refund: furious-but-polite
  'this is unacceptable, get me the manager now',                     // T18 escalate (rule)
  'I want to file a complaint about the counter service',             // T19 escalate (rule)
  'what is the capital of France?',                                   // T20 out-of-domain (classifier)
  'when do you close on friday?',                                     // T21 hours (rule)
  'you know me, I am in here every week — this bread is stale, I would like to return it', // T22 refund: regular-customer
  'hi, it is my first time in your shop — the eggs I just bought were cracked, I want a refund', // T23 refund: first-timer
  'do you repair bicycles?',                                          // T24 out-of-domain (classifier)
];

const engine = makeEngine(sheet, {
  budget: { typesafe: 6, deepinfra: 20 },
  traceFile: '/home/z/my-project/quilt-storefront/runs/live-session-2.jsonl',
  fs,
});
const turns = await engine.runSession(SESSION);

console.log('ROUTE SUMMARY');
const tally = {};
for (const t of turns) tally[`${t.route}@${t.routed_via}`] = (tally[`${t.route}@${t.routed_via}`] || 0) + 1;
console.log(JSON.stringify(tally, null, 1));
for (const t of turns) {
  console.log(`T${String(t.turn).padStart(2)} ${t.route.padEnd(16)} via=${t.routed_via.padEnd(10)} src=${String(t.answer_source).padEnd(15)} ${String(t.reply).slice(0, 88)}`);
}
console.log('budget remaining:', JSON.stringify(engine.budgetRemaining));
