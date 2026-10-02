// src/run.js — the live play-test driver (lane 66-e).
// Scripted 12-turn session covering every route + 2 out-of-domain turns.
// Per-turn trace → runs/live-session.jsonl (adjustments appended when a turn is fixed).
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
  'good morning!',                          // greeter/chitchat (classifier route)
  'what are your hours on saturday?',       // hours (rule)
  'do you have milk?',                      // stock (rule)
  'how much are eggs?',                     // prices (rule)
  'the milk I bought yesterday spoiled early and I am upset', // refund (rule → joint)
  'i want to speak to a manager',           // escalate (rule + hook)
  'do you carry oat flour?',                // stock miss (lookup default)
  'can I bring my dog in',                  // out-of-domain → classifier → fallback
  'what time do you close on sunday',       // hours (rule, different key)
  'how much for socks',                     // prices (rule)
  'thanks, you are the best',               // greeter-ish (classifier)
  'my socks ripped on the first wear, can I return them', // refund (rule → joint)
];

const engine = makeEngine(sheet, {
  budget: { typesafe: 6, deepinfra: 15 },
  traceFile: '/home/z/my-project/quilt-storefront/runs/live-session.jsonl',
  fs,
});
const turns = await engine.runSession(SESSION);

console.log('ROUTE SUMMARY');
const tally = {};
for (const t of turns) tally[`${t.route}@${t.routed_via}`] = (tally[`${t.route}@${t.routed_via}`] || 0) + 1;
console.log(JSON.stringify(tally, null, 1));
for (const t of turns) {
  console.log(`T${String(t.turn).padStart(2)} ${t.route.padEnd(18)} via=${t.routed_via.padEnd(10)} src=${String(t.answer_source).padEnd(18)} ${String(t.reply).slice(0, 90)}`);
}
console.log('budget remaining:', JSON.stringify(engine.budgetRemaining));
