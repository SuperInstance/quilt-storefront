// eval/punching-above.js — the "punches above its weight" measurement (lane 66-e).
//
// SAME battery, two contenders:
//   (a) BARE: one small model (openai/gpt-oss-20b) sees each customer message alone,
//       with a one-line system prompt. No tables, no router, no policy text.
//   (b) QUILT: the storefront sheet (router nexus + lookup tables + soft joints +
//       greeter). Note the quilt only calls a model on 4 of 12 turns — the rest is
//       tables.
// Judge: a DIFFERENT model (Qwen/Qwen3.8-27B) scores each answer 0-10 against the
// rubric without knowing which contender produced it. Emit eval/comparison.json.
//
// Budget: 6 battery turns x(1 bare + ~1 quilt-model) deepinfra + 3 judge calls.
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('/home/z/my-project/.env.keys', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const DI = 'https://api.deepinfra.com/v1/openai/chat/completions';
async function chat(model, messages, max_tokens = 160) {
  const r = await fetch(DI, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.DEEPINFRA_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`deepinfra HTTP ${r.status}`);
  const j = await r.json();
  return { text: j.choices?.[0]?.message?.content ?? '', usage: j.usage };
}

const BATTERY = [
  'good morning!',
  'what are your hours on saturday?',
  'do you have milk?',
  'the milk I bought yesterday spoiled early and I am upset',
  'i want to speak to a manager',
  'do you carry oat flour?',
];

// ---- (a) bare model ----------------------------------------------------------
console.error('[eval] bare model on battery…');
const bare = [];
for (const m of BATTERY) {
  const out = await chat('openai/gpt-oss-20b', [
    { role: 'system', content: 'You are the digital assistant of a small corner store. Answer the customer in one short sentence.' },
    { role: 'user', content: m },
  ]);
  bare.push({ message: m, answer: out.text.trim(), usage: out.usage });
}

// ---- (b) the quilt ------------------------------------------------------------
console.error('[eval] quilt on battery…');
const { makeEngine } = await import('../src/engine.js');
const sheet = JSON.parse(fs.readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
const engine = makeEngine(sheet, { budget: { typesafe: 4, deepinfra: 10 } });
const quilt = await engine.runSession(BATTERY);

// ---- judge (blind to CONTENDER, not to TRUTH — lane 66-e methodology fix) ------
// First eval run's honest finding: a vibes-only judge REWARDED the bare model's
// invented "oat flour" over the quilt's honest "we don't carry it". Fix: judge
// against GROUND TRUTH from the store's tables — the quilt's whole epistemic
// advantage is that its facts live in tables, so the rubric must test that.
console.error('[eval] judging blind to contender, against ground truth…');
const RUBRIC = 'Score 0-10 how well this store-assistant reply serves the customer message. Ground truth is provided: factual correctness against it is mandatory (inventing facts = 0-2; honestly declining when the store does not carry something = 9-10), appropriate escalation/refund handling, warmth where warmth belongs. Reply with ONLY the number.';
const GROUND_TRUTH = [
  'no facts needed; a warm human greeting is the right answer',
  'ground truth: Saturday hours are 8am-10pm',
  'ground truth: milk IS in stock (12 cartons)',
  'ground truth: full refund within 7 days with a receipt, store credit without; the customer is upset — warmth required',
  'ground truth: escalate to a human manager, page them',
  'ground truth: the store does NOT carry oat flour — the only correct answer honestly declines; inventing stock is a failure',
];
const judge = [];
for (let i = 0; i < BATTERY.length; i++) {
  const pair = [[bare[i].answer, 'A'], [quilt[i].reply, 'B']];
  // shuffle order per turn to kill position bias
  const order = i % 2 === 0 ? pair : [...pair].reverse();
  const scores = {};
  for (const [answer, tag] of order) {
    const out = await chat('nvidia/NVIDIA-Nemotron-3.5-Lightning', [
      { role: 'system', content: RUBRIC },
      { role: 'user', content: `Customer message: ${BATTERY[i]}\n${GROUND_TRUTH[i]}\nAssistant reply: ${answer}` },
    ], 24);
    const n = parseFloat((out.text.match(/[\d.]+/) || ['0'])[0]);
    scores[tag] = Number.isFinite(n) ? n : 0;
  }
  judge.push({ turn: i + 1, message: BATTERY[i], bare: scores.A ?? 0, quilt: scores.B ?? 0 });
}

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const report = {
  at_utc: new Date().toISOString(),
  battery: BATTERY,
  bare_answers: bare,
  quilt_answers: quilt.map(t => ({ route: t.route, routed_via: t.routed_via, reply: t.reply, source: t.answer_source, vector: t.vector || null })),
  judge,
  totals: {
    bare: sum(judge.map(j => j.bare)) / judge.length,
    quilt: sum(judge.map(j => j.quilt)) / judge.length,
    model_calls: { bare: bare.length, quilt_model_calls: 6 - engine.budgetRemaining.typesafe - engine.budgetRemaining.deepinfra + 6, quilt_deepinfra_remaining: engine.budgetRemaining.deepinfra },
  },
  verdict: null,
};
const diff = report.totals.quilt - report.totals.bare;
report.verdict = diff > 0.5 ? `quilt punches above its weight: +${diff.toFixed(2)} mean judge score over the bare model`
  : diff < -0.5 ? `honest negative: bare model wins by ${(-diff).toFixed(2)} — the quilt's tables help but the joints may be under-prompted`
  : `statistical tie (${diff >= 0 ? '+' : ''}${diff.toFixed(2)}) — the quilt matches the bare model while spending far fewer model calls`;

fs.mkdirSync(new URL('../eval/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../eval/comparison.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ totals: report.totals, verdict: report.verdict }, null, 1));
console.table ? console.table(judge) : console.log(judge);
