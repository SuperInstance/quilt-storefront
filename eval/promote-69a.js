// eval/promote-69a.js — THE PROMOTION (lane 69-a): the first LIVE freeze of the thesis.
//
// Reads eval/freeze-live-report-69a.json (the v2 accounting over the live session),
// writes every promotable buckets=3 proposal into the REAL sheet —
// sheets/storefront.json → refunder.frozen.table — as evidence-carrying rows
// (answer is RENDER[class], never the model's prose, never hand-written), then
// PROVES the promotion with a ZERO-CALL replay:
//   - each promoted region's live messages are re-served by a fresh engine whose
//     model budgets are 0/0 — a single model attempt would fail closed loudly;
//   - every replayed member must answer as frozen-lookup with the exact region key
//     and the exact RENDER sentence;
//   - a fact-starved control message must STILL be refused to the ask-back (the
//     frozen rows may never serve a moment the gate would refuse).
// Updates the prereg results metric live69.liveFreezePromoted with the
// replay-verified count (claims stay sealed; this is the run's own output).
import fs from 'node:fs';
import { makeEngine } from '../src/engine.js';

const report = JSON.parse(fs.readFileSync(new URL('./freeze-live-report-69a.json', import.meta.url), 'utf8'));
const promotable = report.promotable_proposals ?? [];

if (promotable.length === 0) {
  console.log('PROMOTION: nothing promotable — refunder.frozen stays empty (evidence or nothing). See freeze-live-report-69a.json.');
  process.exit(0);
}

// ---- 1. write the rows into the real sheet ---------------------------------------
const sheetPath = new URL('../sheets/storefront.json', import.meta.url);
const sheet = JSON.parse(fs.readFileSync(sheetPath, 'utf8'));
const frozenCell = sheet.cells.find(c => c.id === 'refunder.frozen');
if (!frozenCell || frozenCell.kind !== 'lookup') throw new Error('refunder.frozen cell missing');
const trace = fs.readFileSync(new URL('../runs/live-session-3.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const now = new Date().toISOString();

for (const p of promotable) {
  if (frozenCell.table?.[p.region]) throw new Error(`region already frozen: ${p.region}`);
  const evidence = p.members.map(id => {
    const t = trace.find(x => x.turn === Number(id.slice(1)));
    return `live 69-a ${id}: extracted ${JSON.stringify(t.facts)} → model ruled "${t.reply}" (tokens ${t.usage?.prompt_tokens}/${t.usage?.completion_tokens})`;
  });
  frozenCell.table = frozenCell.table ?? {};
  frozenCell.table[p.region] = {
    class: p.output, n: p.n, answer: p.answer, evidence,
    frozen_at_utc: now, corpus: 'live-69a runs/live-session-3.jsonl (lane 69-a, first live freeze)',
  };
}
sheet.meta = sheet.meta ?? {};
sheet.meta.first_live_freeze = {
  at_utc: now,
  wave: '69-a',
  promoted_regions: promotable.map(p => ({ region: p.region, class: p.output, n: p.n, members: p.members })),
  law: 'buckets=3 unanimous n>=3, factBearing (requireFacts), all policy-input facts grounded, output == written policy on facts (outcomeFromFacts), zero-call replay serves the row — evidence or nothing (67-c law), RENDER not prose',
  corpus: 'runs/live-session-3.jsonl — the LIVE 24-turn refunder session (8 deepinfra gpt-oss-20b rulings, receipted)',
};
fs.writeFileSync(sheetPath, JSON.stringify(sheet, null, 2) + '\n');
console.log(`PROMOTED ${promotable.length} frozen row(s) into sheets/storefront.json → refunder.frozen`);

// ---- 2. the zero-call replay proof ------------------------------------------------
const replaySheet = JSON.parse(fs.readFileSync(sheetPath, 'utf8'));
const messages = [];
for (const p of promotable) {
  for (const id of p.members) {
    const t = trace.find(x => x.turn === Number(id.slice(1)));
    messages.push({ message: t.message, expectRegion: p.region, expectClass: p.output, member: id });
  }
}
const STARVED_CONTROL = report.fact_starved_live[0]?.message;
const engine = makeEngine(replaySheet, { budget: { typesafe: 0, deepinfra: 0 }, traceFile: new URL('../runs/frozen-replay-69a.jsonl', import.meta.url).pathname, fs });
let ok = 0, bad = [];
// runSession for the frozen members
const frozenTurns = await engine.runSession(messages.map(m => m.message));
frozenTurns.forEach((t, i) => {
  const exp = messages[i];
  const expectedAnswer = promotable.find(p => p.region === exp.expectRegion).answer;
  const good = t.answer_source === 'frozen-lookup' && t.frozen?.region === exp.expectRegion && t.reply === expectedAnswer;
  if (good) ok += 1;
  else bad.push({ member: exp.member, got_source: t.answer_source, got_region: t.frozen?.region ?? null, reply: String(t.reply).slice(0, 60) });
});
// starved control must still be refused (never served a frozen outcome)
let controlOk = false;
if (STARVED_CONTROL) {
  const [t] = await makeEngine(replaySheet, { budget: { typesafe: 0, deepinfra: 0 } }).runSession([STARVED_CONTROL]);
  controlOk = t.fact_refused === true && t.routed_to === 'refunder.ask-receipt';
  console.log(`starved control: fact_refused=${t.fact_refused} routed_to=${t.routed_to} (must stay refused)`);
}
console.log(`replay: ${ok}/${messages.length} served as frozen-lookup with exact region+RENDER · budget remaining: ${JSON.stringify(engine.budgetRemaining)} · control ok: ${controlOk}`);
if (bad.length) console.log('REPLAY MISMATCHES:', JSON.stringify(bad, null, 1));

const verified = bad.length === 0 && ok === messages.length && (!STARVED_CONTROL || controlOk);
// ---- 3. update the prereg results metric ------------------------------------------
const resultsPath = new URL('./freeze-live-results-69a.json', import.meta.url);
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
results.metrics.live69.liveFreezePromoted = verified ? promotable.length : 0;
results.metrics.live69.liveFreezeReplayVerified = verified;
results.note += ' · liveFreezePromoted set by eval/promote-69a.js after the zero-call replay verification';
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2) + '\n');
console.log(verified
  ? `FIRST LIVE FREEZE VERIFIED: ${promotable.length} row(s) serve live with ZERO model calls.`
  : 'REPLAY FAILED — the promotion is NOT verified; liveFreezePromoted stays 0 (honest).');
process.exit(verified ? 0 : 1);
