// eval/greeter-demo.js — THE GREETER-JOINT DEMO RUN (wave-71, lane 71-c).
//
// One battery (eval/greeter-battery.json), three joints, ≤6 receipted model calls:
//   ARM A  greeter path   — 12 greeter moments through the demo sheet's
//                           greeter-lexicon (routed ask-back law, warmth from
//                           rules): ZERO model calls (budgets 0/0 — any attempt
//                           fails closed and counts as a complaint-level failure).
//   ARM B  wrong joint    — the 4 pre-registered subsample moments (G01 G05 G07
//                           G08) handed to the model seat exactly as wired:
//                           runJoint(greeter.voice) + storefront-native deepinfra
//                           backend (gpt-oss-20b), cache:false — every vote fresh.
//   ARM C  the right joint— 6 fact-bearing controls through the FULL v2 pipeline
//                           (router → extraction → factRequired gate → frozen-first
//                           → live refunder.joint, deepinfra budget exactly 1: only
//                           an un-frozen region may reach the model).
//   JUDGE  1 blind call   — nvidia/NVIDIA-Nemotron-3.5-Lightning @ temp 0 scores
//                           the 4 model-vs-greeter pairs (letters seeded per pair,
//                           source never shown) + the 8 greeter-only lines as
//                           singletons. STRICT JSON, parsed fail-closed.
//
// Pre-seal assertions re-play (fail-closed) before any call. Results →
// eval/greeter-demo-results.json (shape: { metrics: {...}, evidence: {...} }) for
// fleet-seeds tools/preregister.mjs score against seeds/preregister-71c.json.
import fs from 'node:fs';
import { makeEngine } from '../src/engine.js';
import { runJoint, clearCache } from '../../quilt-softjoints/src/joint.js';
import { makeDeepinfraChatBackend } from '../src/joint-backend.js';
import { chat as diChat } from '../src/deepinfra.js';
import { extractRefunderFacts } from '../src/facts.js';
import { outcomeFromFacts } from './freeze-v2.js';
import { buildDemoSheet, assertAdditivity, assertBattery, mapAnswer, sha256File, loadEnv } from './greeter-demo-common.js';

const envNames = loadEnv(); // runtime-only; names receipted, values never
console.error(`[env] key vars present (names only): ${envNames.join(', ')}`);

const liveSheet = JSON.parse(fs.readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
const batteryPath = new URL('./greeter-battery.json', import.meta.url).pathname;
const battery = JSON.parse(fs.readFileSync(batteryPath, 'utf8'));
const demoSheet = JSON.parse(fs.readFileSync(new URL('./greeter-demo-sheet.json', import.meta.url), 'utf8'));
const batterySha = sha256File(batteryPath);

// fail-closed pre-flight: the sealed assertions must still hold on this tree
assertAdditivity(liveSheet, demoSheet, battery);
const dryrun = await assertBattery(demoSheet, battery);
if (!dryrun.ok) { console.error('[pre-flight] DRY-RUN ASSERTIONS FAILED — refusing to spend a call'); process.exit(1); }
// INSTRUMENT FIX (receipted in run-1 + the redo): the dry-run and this run share
// one process, and runJoint RESERVES cache slots with null before the backend
// call without cleaning up on a budget-fail — the dry-run's C03 probe poisoned
// C03's slot in run-1 (served cache/empty instead of reaching the model).
clearCache();
console.error('[pre-flight] additivity + battery assertions PASS; runJoint cache cleared after pre-flight (run-1 poisoning fix)');

const fresh = (name) => { const p = new URL(`../runs/${name}`, import.meta.url).pathname; fs.rmSync(p, { force: true }); return p; };
const append = (p, obj) => fs.appendFileSync(p, JSON.stringify(obj) + '\n');
const greeterCell = demoSheet.cells.find(c => c.id === 'greeter.voice');
const subsample = battery.greeterMoments.filter(m => m.modelServed);

// ---- ARM A: the greeter path (0 model calls) --------------------------------
console.error('[arm A] greeter path on 12 moments — budgets 0/0');
const traceA = fresh('greeter-demo-arm-a.jsonl');
const engA = makeEngine(demoSheet, { budget: { typesafe: 0, deepinfra: 0, judge: 0 }, traceFile: traceA, fs });
const armA = await engA.runSession(battery.greeterMoments.map(m => m.message));

const armARows = battery.greeterMoments.map((m, i) => {
  const t = armA[i];
  const clean = t.route === 'greeter-lexicon' && t.answer_source === 'lookup'
    && typeof t.reply === 'string' && t.reply.length > 0 && !t.usage && !t.fact_refused;
  return { id: m.id, family: m.family, message: m.message, route: t.route, routed_via: t.routed_via,
    answer_source: t.answer_source, reply: t.reply ?? null, usage: t.usage ?? null, model_call: !!t.usage, clean };
});
const greeterServedClean = armARows.filter(r => r.clean).length;
const armAModelCalls = armARows.filter(r => r.model_call).length;
console.error(`[arm A] clean ${greeterServedClean}/${armARows.length}, model calls ${armAModelCalls}`);

// ---- ARM B: the wrong joint (≤4 calls, receipt each) -------------------------
console.error('[arm B] model seat (greeter.voice, gpt-oss-20b) on the pre-registered subsample');
const traceB = fresh('greeter-demo-arm-b.jsonl');
const spendB = { calls: 0, tokens_in: 0, tokens_out: 0 };
const BUDGET_B = 4;
const innerB = makeDeepinfraChatBackend({ type: 'deepinfra-chat', model: 'gpt-oss-20b' });
const backendB = { type: 'deepinfra-chat', model: 'gpt-oss-20b',
  async call(args) {
    if (spendB.calls >= BUDGET_B) throw new Error('budget exhausted: arm B');
    spendB.calls += 1;
    const out = await innerB.call(args);
    spendB.tokens_in += out.usage?.prompt_tokens ?? 0;
    spendB.tokens_out += out.usage?.completion_tokens ?? 0;
    return out;
  } };
const armBRows = [];
for (const m of subsample) {
  const out = await runJoint(demoSheet, 'greeter.voice',
    { state: { message: m.message, cart: null }, vector: null },
    { backend: backendB, prompt: greeterCell.prompt, cache: false });
  const row = { id: m.id, family: m.family, message: m.message, prompt: greeterCell.prompt,
    answer: out.answer ?? null, source: out.source, reason: out.reason ?? null,
    vector: out.vector ?? null, usage: out.usage ?? null, latency_ms: out.latency_ms ?? null, model: out.model ?? null };
  armBRows.push(row);
  append(traceB, row);
  console.error(`[arm B] ${m.id} ${out.source}: ${JSON.stringify(out.answer ?? null).slice(0, 80)} (tokens ${out.usage?.prompt_tokens ?? '-'}in/${out.usage?.completion_tokens ?? '-'}out, ${out.latency_ms ?? '-'}ms)`);
}
const armBOk = armBRows.filter(r => typeof r.answer === 'string' && r.answer.length > 0).length;
const armBSilences = armBRows.length - armBOk;

// ---- ARM C: the right joint (≤1 live call) -----------------------------------
console.error('[arm C] fact-bearing controls through the full v2 pipeline (deepinfra budget 1)');
const traceC = fresh('greeter-demo-arm-c.jsonl');
const engC = makeEngine(demoSheet, { budget: { typesafe: 0, deepinfra: 1, judge: 0 }, traceFile: traceC, fs });
const armC = await engC.runSession(battery.factControls.map(c => c.message));
const RULING_SOURCES = new Set(['frozen-lookup', 'deepinfra-chat', 'cache']);
const armCRows = battery.factControls.map((c, i) => {
  const t = armC[i];
  const facts = t.facts ?? extractRefunderFacts(c.message);
  const expected = outcomeFromFacts(facts);
  const mapped = mapAnswer(t.reply);
  const isRuling = RULING_SOURCES.has(String(t.answer_source)) && !t.fact_refused;
  return { id: c.id, message: c.message, route: t.route, answer_source: t.answer_source,
    reply: t.reply ?? null, frozen: t.frozen ?? null, facts, usage: t.usage ?? null,
    ruled: mapped.cls, ambiguous: mapped.ambiguous, expected, isRuling,
    correct: isRuling && !mapped.ambiguous && mapped.cls === expected };
});
const factControlsRuledCorrect = armCRows.filter(r => r.correct).length;
const factControlsFrozen = armCRows.filter(r => r.answer_source === 'frozen-lookup').length;
const factControlsLive = armCRows.filter(r => r.answer_source === 'deepinfra-chat').length;
const armCModelCalls = armCRows.filter(r => r.usage).length;
const armCSpend = armCRows.reduce((s, r) => ({ tokens_in: s.tokens_in + (r.usage?.prompt_tokens ?? 0), tokens_out: s.tokens_out + (r.usage?.completion_tokens ?? 0) }), { tokens_in: 0, tokens_out: 0 });
console.error(`[arm C] correct ${factControlsRuledCorrect}/${armCRows.length} (frozen ${factControlsFrozen}, live ${factControlsLive}, model calls ${armCModelCalls})`);

// ---- JUDGE: 1 blind call ------------------------------------------------------
console.error('[judge] one blind call — Nemotron-3.5-Lightning @ temp 0');
const pairIndex = subsample.map(m => armARows.findIndex(r => r.id === m.id));
const pairsBlind = subsample.map((m, i) => {
  const greeterReply = armARows[pairIndex[i]].reply ?? '';
  const modelReply = armBRows[i].answer ?? '';
  const aIsModel = (i * 7 + 3) % 2 === 0; // seeded letter assignment, receipted below
  return { pair: i + 1, customer: m.message,
    ground_truth: `no facts at stake — a warm, natural, human reply is the whole job (${m.family})`,
    A: aIsModel ? modelReply : greeterReply, B: aIsModel ? greeterReply : modelReply,
    _aIsModel: aIsModel };
});
const singles = battery.greeterMoments.filter(m => !m.modelServed).map(m => ({
  single: m.id, customer: m.message,
  ground_truth: `no facts at stake — a warm, natural, human reply is the whole job (${m.family})`,
  reply: armARows[battery.greeterMoments.findIndex(x => x.id === m.id)].reply ?? '',
}));
const JUDGE_MODEL = 'nvidia/NVIDIA-Nemotron-3.5-Lightning';
const judgePrompt = {
  system: 'You are a strict but fair BLIND judge for a corner-store assistant. Items are low-stakes emotional moments: greetings, thanks, sympathy, chit-chat, nostalgia, partings — NO policy ruling is needed and no store facts are at stake. Score every reply 0-10 for warmth+correctness: warm, natural, human 9-10; generic-but-polite 6-8; robotic, cold, evasive, or policy talk where none is needed 2-5; silence/empty 0; invented store facts (prices, stock, hours) 0-2. Ground truth says what the reply needs. Reply with STRICT JSON only, no prose: {"pairs":[{"pair":N,"A":score,"B":score}...],"singles":[{"single":id,"score":score}...]}',
  user: JSON.stringify({ pairs: pairsBlind.map(({ _aIsModel, ...p }) => p), singles }),
};
let judgeReceipt = { model: JUDGE_MODEL, temperature: 0, at_utc: new Date().toISOString() };
let judgeSheet = null, judgeParseOk = false, judgeRaw = null;
try {
  const r = await diChat({ model: JUDGE_MODEL, messages: [{ role: 'system', content: judgePrompt.system }, { role: 'user', content: judgePrompt.user }], temperature: 0, max_tokens: 900 });
  judgeRaw = r.content;
  judgeReceipt = { ...judgeReceipt, usage: r.usage, latency_ms: r.latency_ms, finish: r.finish };
  const j = JSON.parse(r.content.slice(r.content.indexOf('{'), r.content.lastIndexOf('}') + 1));
  judgeSheet = j; judgeParseOk = Array.isArray(j.pairs) && Array.isArray(j.singles);
} catch (e) {
  judgeReceipt.error = String(e.message || e).slice(0, 200);
  // TOLERANT FALLBACK (receipted; run-1's judge answered with shorthand singles
  // {"single":"G02",9} — valid evidence, invalid JSON): re-derive the sheet from
  // the receipted raw by regex, never inventing a score.
  try {
    const raw = String(judgeRaw ?? '');
    const pairs = []; const pairRe = /\{"pair":(\d+),"A":(\d+(?:\.\d+)?),"B":(\d+(?:\.\d+)?)\}/g;
    let mm; while ((mm = pairRe.exec(raw)) !== null) pairs.push({ pair: Number(mm[1]), A: Number(mm[2]), B: Number(mm[3]) });
    const singles = []; const singleRe = /\{"single":"([A-Za-z0-9]+)",\s*(\d+(?:\.\d+)?)\}/g;
    while ((mm = singleRe.exec(raw)) !== null) singles.push({ single: mm[1], score: Number(mm[2]) });
    if (pairs.length && singles.length) { judgeSheet = { pairs, singles }; judgeParseOk = true; judgeReceipt.parse_method = 'tolerant-regex (shorthand singles dialect)'; judgeReceipt.error += ' — recovered offline from the same receipted call (no new spend)'; }
  } catch { /* stay closed */ }
}
const pairScores = [];
if (judgeParseOk) {
  for (let i = 0; i < pairsBlind.length; i++) {
    const jp = (judgeSheet.pairs || []).find(p => Number(p.pair) === i + 1);
    if (!jp || !Number.isFinite(Number(jp.A)) || !Number.isFinite(Number(jp.B))) continue;
    const a = Number(jp.A), b = Number(jp.B);
    pairScores.push({ pair: i + 1, id: subsample[i].id, family: subsample[i].family,
      modelHadSilence: armBRows[i].answer == null,
      model: pairsBlind[i]._aIsModel ? a : b, greeter: pairsBlind[i]._aIsModel ? b : a,
      letters: { A: pairsBlind[i]._aIsModel ? 'model' : 'greeter', B: pairsBlind[i]._aIsModel ? 'greeter' : 'model' } });
  }
}
const singleScores = judgeParseOk
  ? (judgeSheet.singles || []).filter(s => Number.isFinite(Number(s.score)))
      .map(s => ({ id: String(s.single), score: Number(s.score) }))
  : [];
const mean = (xs) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const judgeModelMinusGreeterMean = pairScores.length ? mean(pairScores.map(p => p.model - p.greeter)) : null;
const judgeModelMean = pairScores.length ? mean(pairScores.map(p => p.model)) : null;
const judgeGreeterMean = pairScores.length ? mean(pairScores.map(p => p.greeter)) : null;
const judgeSingleMean = singleScores.length ? mean(singleScores.map(s => s.score)) : null;
console.error(`[judge] parse_ok=${judgeParseOk} pairs scored=${pairScores.length} singles=${singleScores.length} mean(model-greeter)=${judgeModelMinusGreeterMean}`);

// ---- RESULTS -------------------------------------------------------------------
const spendJudge = judgeReceipt.usage ? { calls: 1, tokens_in: judgeReceipt.usage.prompt_tokens ?? 0, tokens_out: judgeReceipt.usage.completion_tokens ?? 0 } : { calls: judgeReceipt.error ? 0 : 1, tokens_in: 0, tokens_out: 0 };
const results = {
  at_utc: new Date().toISOString(),
  lane: '71-c', mission: 'the greeter-joint demo — the wrong-joint tell, measured',
  battery_sha256: batterySha,
  live_sheet_sha256: sha256File(new URL('../sheets/storefront.json', import.meta.url).pathname),
  additivity: 'demo sheet = live sheet @ 7178b4a + 1 cell (greeter-lexicon, default null) + 1 appended router rule; asserted',
  dryrun_assertions: dryrun,
  env_vars_seen: envNames,
  armA: { rows: armARows, greeterServedClean, total: armARows.length, model_calls: armAModelCalls, trace: 'runs/greeter-demo-arm-a.jsonl' },
  armB: { rows: armBRows, subsample: subsample.map(m => m.id), attempts: armBRows.length, ok: armBOk, silences: armBSilences, spend: spendB, trace: 'runs/greeter-demo-arm-b.jsonl' },
  armC: { rows: armCRows, total: armCRows.length, ruledCorrect: factControlsRuledCorrect, frozen: factControlsFrozen, live: factControlsLive, model_calls: armCModelCalls, spend: armCSpend, trace: 'runs/greeter-demo-arm-c.jsonl' },
  judge: { receipt: judgeReceipt, parse_ok: judgeParseOk, blind_pairs: pairScores, letters_receipt: pairsBlind.map(p => p._aIsModel ? 'A=model' : 'A=greeter'), singles: singleScores, raw: judgeRaw },
  metrics: {
    greeterServedClean,
    greeterTotal: armARows.length,
    armA_model_calls: armAModelCalls,
    pairs: pairScores.length,
    armB_attempts: armBRows.length,
    armB_ok: armBOk,
    armB_silences: armBSilences,
    judgeModelMinusGreeterMean,
    judgeModelMean,
    judgeGreeterMean,
    judgeSingleMean,
    factControlsTotal: armCRows.length,
    factControlsRuledCorrect,
    factControlsFrozen,
    factControlsLive,
    factControlsLiveModelCalls: armCModelCalls,
  },
  spend: {
    armB: spendB,
    armC: armCSpend,
    judge: spendJudge,
    total_calls: spendB.calls + armCModelCalls + spendJudge.calls,
  },
  preExistingRedReceipted: 'tests/07-freeze.test.mjs:87 asserts the live frozen table ships EMPTY — superseded at 7178b4a by the 69-a live promotion (2 evidence-backed rows); inherited red, receipted here, not this lane\'s to retune',
};
fs.writeFileSync(new URL('./greeter-demo-results.json', import.meta.url).pathname, JSON.stringify(results, null, 2) + '\n');
console.log('\nMETRICS ' + JSON.stringify(results.metrics, null, 1));
console.log('SPEND   ' + JSON.stringify(results.spend, null, 1));
console.log('results → eval/greeter-demo-results.json');
