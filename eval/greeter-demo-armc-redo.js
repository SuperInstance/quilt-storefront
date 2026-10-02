// eval/greeter-demo-armc-redo.js — run-1 completion (wave-71, lane 71-c).
//
// WHAT HAPPENED IN RUN 1 (receipted, eval/greeter-demo-results.json):
//   The pre-flight dry-run (assertBattery) and the live run shared ONE process,
//   and quilt-softjoints' runJoint cache RESERVES slots with null before the
//   backend call (`CACHE.set(cacheKey, null)` dedupe) without cleaning up on a
//   budget-exhausted failure. The dry-run's C03 probe (budget 0) therefore
//   poisoned C03's cache slot; the live run's C03 runJoint call hit the reserved
//   slot (source 'cache', empty reply) and NEVER reached the model — the ARM C
//   deepinfra budget stayed unspent (run-1 total 5/6 calls).
//   Separately, the judge DID answer (finish=stop, 1145+135 tokens, raw
//   receipted verbatim) but in a dialect my parser refused: the singles entries
//   use the shorthand {"single":"G02",9}. The sheet is fully recoverable from
//   the receipted raw — the 70-a-r2 precedent (m13-llm-leg-redo.mjs): results
//   re-derived offline from the receipted ledger, ZERO new evidence calls.
//
// THIS REDO (1 new call, the 6th and last of the ≤6 budget):
//   1. re-assert the pre-seal battery assertions (fail-closed);
//   2. clearCache() BEFORE the live turn (the instrument fix, receipted);
//   3. re-run ONLY C03 through the full v2 pipeline (deepinfra budget exactly 1);
//   4. offline-parse the receipted judge raw (tolerant of the shorthand; 4 pairs
//      + 8 singles asserted, else fail-closed);
//   5. write eval/greeter-demo-results-r2.json = the completed accounting
//      (run-1 artifacts preserved verbatim inside).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { makeEngine } from '../src/engine.js';
import { clearCache } from '../../quilt-softjoints/src/joint.js';
import { outcomeFromFacts } from './freeze-v2.js';
import { assertAdditivity, assertBattery, mapAnswer, sha256File, loadEnv } from './greeter-demo-common.js';

const envNames = loadEnv(); // runtime-only key vars — run-1 lesson: a fresh process needs its own env load
console.error(`[env] key vars present (names only): ${envNames.join(', ')}`);

const results1 = JSON.parse(fs.readFileSync(new URL('./greeter-demo-results.json', import.meta.url), 'utf8'));
const liveSheet = JSON.parse(fs.readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
const battery = JSON.parse(fs.readFileSync(new URL('./greeter-battery.json', import.meta.url), 'utf8'));
const demoSheet = JSON.parse(fs.readFileSync(new URL('./greeter-demo-sheet.json', import.meta.url), 'utf8'));

// fail-closed pre-flight, then THE FIX (same process ⇒ must clear the shared cache)
assertAdditivity(liveSheet, demoSheet, battery);
const dryrun = await assertBattery(demoSheet, battery);
if (!dryrun.ok) { console.error('[redo] pre-flight FAILED — refusing'); process.exit(1); }
const cacheSizeBefore = 'module-level (opaque)';
clearCache();
console.error(`[redo] pre-flight PASS; runJoint cache cleared after pre-flight (was poisoned by the dry-run's reserved slot) — was: ${cacheSizeBefore}`);

// ---- C03 live ruling (the 6th call) -----------------------------------------
const c03 = battery.factControls.find(c => c.id === 'C03');
const traceR = new URL('../runs/greeter-demo-arm-c-c03-redo.jsonl', import.meta.url).pathname;
fs.rmSync(traceR, { force: true });
const eng = makeEngine(demoSheet, { budget: { typesafe: 0, deepinfra: 1, judge: 0 }, traceFile: traceR, fs });
const [t] = await eng.runSession([c03.message]);
const facts = t.facts ?? [];
const expected = outcomeFromFacts(facts);
const mapped = mapAnswer(t.reply);
const RULING_SOURCES = new Set(['frozen-lookup', 'deepinfra-chat', 'cache']);
const row = { id: 'C03', message: c03.message, route: t.route, answer_source: t.answer_source,
  reply: t.reply ?? null, frozen: t.frozen ?? null, facts, usage: t.usage ?? null,
  ruled: mapped.cls, ambiguous: mapped.ambiguous, expected,
  isRuling: RULING_SOURCES.has(String(t.answer_source)) && !t.fact_refused && String(t.reply ?? '').length > 0,
  correct: false };
row.correct = row.isRuling && !mapped.ambiguous && mapped.cls === expected;
appendLine(traceR, row);
function appendLine(p, obj) { fs.appendFileSync(p, JSON.stringify(obj) + '\n'); }
console.error(`[redo] C03 ${row.answer_source}: ${JSON.stringify(row.reply).slice(0, 100)} → ruled=${row.ruled} expected=${row.expected} correct=${row.correct} (tokens ${row.usage?.prompt_tokens ?? '-'}/${row.usage?.completion_tokens ?? '-'})`);
if (!row.usage) { console.error('[redo] C03 spent NO call — redo invalid, refusing to write r2'); process.exit(1); }

// ---- offline parse of the RECEIPTED judge raw (0 new calls) -------------------
const raw = results1.judge.raw;
const rawSha = 'sha256:' + createHash('sha256').update(raw).digest('hex');
const pairs = [];
const pairRe = /\{"pair":(\d+),"A":(\d+(?:\.\d+)?),"B":(\d+(?:\.\d+)?)\}/g;
let m; while ((m = pairRe.exec(raw)) !== null) pairs.push({ pair: Number(m[1]), A: Number(m[2]), B: Number(m[3]) });
const singles = [];
const singleRe = /\{"single":"([A-Za-z0-9]+)",\s*(\d+(?:\.\d+)?)\}/g;
while ((m = singleRe.exec(raw)) !== null) singles.push({ id: m[1], score: Number(m[2]) });
if (pairs.length !== 4 || singles.length !== 8) {
  console.error(`[redo] offline parse incomplete: pairs=${pairs.length} singles=${singles.length} — fail-closed`);
  process.exit(1);
}
const subsample = battery.greeterMoments.filter(mm => mm.modelServed);
const armARows = results1.armA.rows;
const armBRows = results1.armB.rows;
const pairScores = pairs.map((p, i) => {
  const aIsModel = (i * 7 + 3) % 2 === 0; // the sealed letter assignment, re-applied
  return { pair: p.pair, id: subsample[i].id, family: subsample[i].family,
    modelHadSilence: armBRows[i].answer == null,
    model: aIsModel ? p.A : p.B, greeter: aIsModel ? p.B : p.A,
    letters: { A: aIsModel ? 'model' : 'greeter', B: aIsModel ? 'greeter' : 'model' } };
});
const mean = (xs) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const judgeModelMinusGreeterMean = mean(pairScores.map(p => p.model - p.greeter));
const judgeModelMean = mean(pairScores.map(p => p.model));
const judgeGreeterMean = mean(pairScores.map(p => p.greeter));
const judgeSingleMean = mean(singles.map(s => s.score));
console.error(`[redo] judge offline parse: pairs=${pairScores.length} singles=${singles.length} mean(model-greeter)=${judgeModelMinusGreeterMean} (model ${judgeModelMean} vs greeter ${judgeGreeterMean})`);

// ---- completed accounting ------------------------------------------------------
const armCRows = results1.armC.rows.map(r => ({ ...r }));
const idx = armCRows.findIndex(r => r.id === 'C03');
armCRows[idx] = row;
const ruledCorrect = armCRows.filter(r => r.correct).length;
const frozenN = armCRows.filter(r => r.answer_source === 'frozen-lookup').length;
const liveN = armCRows.filter(r => r.answer_source === 'deepinfra-chat').length;
const armCSpend = {
  tokens_in: results1.armC.spend.tokens_in + (row.usage?.prompt_tokens ?? 0),
  tokens_out: results1.armC.spend.tokens_out + (row.usage?.completion_tokens ?? 0),
};
const armCModelCalls = results1.armC.model_calls + 1;
const results2 = {
  ...results1,
  at_utc_r2: new Date().toISOString(),
  supersedes: 'eval/greeter-demo-results.json (run-1, preserved verbatim below except the fields this redo recomputes; run-1 file untouched on disk)',
  redo: {
    reason: 'run-1 instrument bug: pre-flight dry-run and live run shared one process; runJoint reserve-slot (CACHE.set(key,null) on miss, never cleaned on budget-fail) poisoned C03 — it served cache/empty instead of reaching the model (armC budget unspent, 5/6 calls used)',
    fix: 'clearCache() after the pre-flight, before the live turn (greeter-demo.js updated for future lanes)',
    c03_redo_receipt: { at_utc: row.usage ? new Date().toISOString() : null, trace: 'runs/greeter-demo-arm-c-c03-redo.jsonl', source: row.answer_source, ruled: row.ruled, correct: row.correct, usage: row.usage },
    judge_parse: { method: 'offline re-derivation from the receipted run-1 raw (zero new calls; 70-a-r2 redo precedent)', raw_sha256: rawSha, parser: 'pair regex + tolerant singles shorthand {"single":"ID",N}; asserted 4 pairs + 8 singles', pairs_found: pairs.length, singles_found: singles.length },
  },
  armC: { ...results1.armC, rows: armCRows, ruledCorrect, frozen: frozenN, live: liveN, model_calls: armCModelCalls, spend: armCSpend },
  judge: {
    ...results1.judge,
    parse_ok: true,
    parse_method: 'offline re-derivation from receipted raw (run-1 parser failed on the shorthand singles dialect; raw unchanged, sha receipted)',
    blind_pairs: pairScores,
    singles: singles.map(s => ({ id: s.id, score: s.score })),
  },
  metrics: {
    ...results1.metrics,
    pairs: pairScores.length,
    judgeModelMinusGreeterMean,
    judgeModelMean,
    judgeGreeterMean,
    judgeSingleMean,
    factControlsRuledCorrect: ruledCorrect,
    factControlsFrozen: frozenN,
    factControlsLive: liveN,
    factControlsLiveModelCalls: armCModelCalls,
  },
  spend: {
    ...results1.spend,
    armC: armCSpend,
    total_calls: results1.spend.armB.calls + armCModelCalls + results1.spend.judge.calls,
  },
};
fs.writeFileSync(new URL('./greeter-demo-results-r2.json', import.meta.url).pathname, JSON.stringify(results2, null, 2) + '\n');
console.log('\nR2 METRICS ' + JSON.stringify(results2.metrics, null, 1));
console.log('R2 SPEND   ' + JSON.stringify(results2.spend, null, 1));
console.log('results-r2 → eval/greeter-demo-results-r2.json');
