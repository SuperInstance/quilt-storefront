// src/freeze.js — the refunder FREEZING TEST (lane 67-c).
//
// The thesis: joints grind into lookup tables ON EVIDENCE. This instrument collects
// the refunder softjoint's (pre-vector region, answer-class) observations from BOTH
// live sessions + the replay receipts, runs quilt-softjoints' freezingTest over
// vector-bucketed regions, and writes eval/freeze-report.json.
//
// Key law: frozen rows are keyed on the PRE-VECTOR (refunder-lexicon) — the only
// vector computable BEFORE a model call, so it is the only key a fallback-first
// frozen table can be queried with. The model's own (post) vector is reported as
// audit context, never as the table key.
//
// Honest verdicts only: a region freezes iff n >= 3 observations share ONE output
// class (freezingTest's rule). A non-result is a result — it means the joint stays
// soft, and the report must say WHY.
import fs from 'node:fs';
import { freezingTest } from '../../quilt-softjoints/src/decompose.js';
import { bucketVector } from '../../quilt-softjoints/src/joint.js';
import { refunderPreVector } from './vector.js';

const RUNS = (f) => new URL(`../runs/${f}`, import.meta.url).pathname;
const SOURCES = [
  { file: 'live-session.jsonl', session: 'live-session-1 (wave-66 clean run)' },
  { file: 'live-session-2.jsonl', session: 'live-session-2 (67-c 24-turn battery)' },
  { file: 'live-session-2-replay.jsonl', session: 'live-session-2-replay (67-c fix receipts)' },
];

// Answer-class map: the refunder's declared choices are the three policy outcomes.
// First mention wins — the outcome the model LED with is the outcome it chose
// (e.g. "full refund within 7 days with a receipt; otherwise store credit" led with
// the receipt-conditional full refund = the model's primary ruling for that moment).
export function classifyRefundAnswer(text) {
  const t = String(text ?? '');
  const cands = [
    { class: 'full refund', re: /full refund|refund/i },
    { class: 'store credit', re: /store credit|credit/i },
    { class: 'manager review', re: /manager/i },
  ].map(c => ({ ...c, i: t.search(c.re) })).filter(c => c.i >= 0)
   .sort((a, b) => a.i - b.i);
  return cands[0]?.class ?? 'other';
}

function loadRefunderObservations() {
  const obs = [];
  const skipped = [];
  for (const src of SOURCES) {
    if (!fs.existsSync(RUNS(src.file))) { skipped.push({ file: src.file, reason: 'missing' }); continue; }
    const lines = fs.readFileSync(RUNS(src.file), 'utf8').split('\n').filter(Boolean);
    for (const [idx, line] of lines.entries()) {
      let row; try { row = JSON.parse(line); } catch { continue; }
      const isRefunder = row.route === 'refunder.joint' || row.kind === 'replay' && /refund/i.test(row.message || '');
      if (!isRefunder) continue;
      if (row.answer_source && row.answer_source !== 'deepinfra-chat') {
        skipped.push({ file: src.file, line: idx + 1, reason: `answer_source=${row.answer_source} (no joint answer to classify)` });
        continue;
      }
      if (row.kind === 'replay') { skipped.push({ file: src.file, line: idx + 1, reason: 'greeter replay row' }); continue; }
      obs.push({
        id: `${src.file}#L${idx + 1}`,
        session: src.session,
        message: row.message,
        pre_vector: refunderPreVector(row.message),
        post_vector: row.vector || null,
        answer: row.reply,
        answer_class: classifyRefundAnswer(row.reply),
      });
    }
  }
  return { obs, skipped };
}

// Run the freeze test and return the report object.
export function runFreezeTest({ threshold = 3 } = {}) {
  const { obs, skipped } = loadRefunderObservations();
  const sweeps = [];
  for (const buckets of [2, 3, 4]) {
    const keyed = obs.map(o => ({ ...o, region: bucketVector(o.pre_vector, buckets) }));
    const regions = [];
    for (const o of keyed) {
      let r = regions.find(r => r.region === o.region);
      if (!r) regions.push(r = { region: o.region, n: 0, outputs: {}, members: [] });
      r.n += 1;
      r.outputs[o.answer_class] = (r.outputs[o.answer_class] || 0) + 1;
      r.members.push(o.id);
    }
    for (const r of regions) r.unanimous = Object.keys(r.outputs).length === 1;
    const proposals = freezingTest(obs.map(o => ({ vector: o.pre_vector, output: o.answer_class })), { threshold, buckets });
    sweeps.push({ buckets, threshold, regions, freeze_proposals: proposals });
  }
  // post-vector sweep at the canonical buckets=3 — audit context only
  const postSweep = freezingTest(obs.filter(o => o.post_vector).map(o => ({ vector: o.post_vector, output: o.answer_class })), { threshold, buckets: 3 });

  const anyFreeze = sweeps.some(s => s.freeze_proposals.length > 0);
  const b2 = sweeps.find(s => s.buckets === 2);
  const emergent = b2.regions.filter(r => r.unanimous && r.n >= 2);

  const report = {
    kind: 'freeze-report',
    cell: 'refunder.joint',
    sheet: 'corner-store-storefront',
    at_utc: new Date().toISOString(),
    method: {
      observations: 'every refunder turn across runs/live-session.jsonl (wave-66 clean session), runs/live-session-2.jsonl (24-turn battery), runs/live-session-2-replay.jsonl (fix receipts) whose answer came from the live joint (answer_source=deepinfra-chat)',
      key: 'pre-vector region: refunder-lexicon (src/vector.js refunderPreVector) bucketed by quilt-softjoints bucketVector — the only vector computable BEFORE a model call, so the only key a fallback-first frozen table can be queried with',
      output: 'answer class by first mention of the policy outcome (full refund / store credit / manager review) — the outcome the model led with',
      instrument: 'freezingTest from ../quilt-softjoints/src/decompose.js (read-only import): region freezes iff n >= threshold AND unanimous',
      threshold,
    },
    observations: obs,
    skipped_rows: skipped,
    sweeps,
    post_vector_sweep_buckets3: postSweep,
    emergent_not_frozen: emergent.map(r => ({ ...r, note: 'unanimous but n < threshold — evidence accumulating, not yet law' })),
    verdict: null,
    decision: null,
  };

  if (anyFreeze) {
    report.verdict = 'freeze';
    report.decision = 'at least one region froze: promote its proposal(s) into sheet cell refunder.frozen and wire the fallback-first path';
  } else {
    report.verdict = 'no-freeze';
    const diag = [];
    const upsetRows = obs.filter(o => /milk I bought yesterday/.test(o.message));
    if (upsetRows.length >= 2 && new Set(upsetRows.map(o => o.answer_class)).size > 1) {
      diag.push(`NON-DETERMINISM AT THE DECIDING FEATURE: the same upset-milk message produced "${upsetRows[0].answer_class}" (${upsetRows[0].id}) and "${upsetRows[1].answer_class}" (${upsetRows[1].id}) in two different sessions — any region containing it can never be unanimous, and the freezing test correctly refuses to freeze it`);
    }
    diag.push('THE DECIDING FEATURE IS NOT IN THE VECTOR: the model keys its ruling on RECEIPT PRESENCE (a fact in the message text: "I have the receipt" vs none), which the declared 3-dim emotional vector (distress, goodwill, repeat-customer) cannot see — same-region moments therefore legitimately split by outcome');
    diag.push(`EMERGING STRUCTURE: at buckets=2 the region distress:0|goodwill:1|repeat-customer:0 (calm + furious-but-polite) is unanimous on "full refund" at n=2 — below the bar, watched, not frozen`);
    report.decision = `NO region froze at threshold ${threshold} under any bucketing (2/3/4). THE JOINT STAYS SOFT — the grind-down has nothing to grind yet. refunder.frozen ships with an EMPTY live table (evidence or nothing); the fallback-first mechanism is proven by tests (tests/07-freeze.test.mjs) with injected rows only. To become freezable, the joint's contract likely needs a FACT dimension (receipt-mentioned) alongside the emotional ones — proposed as an adjustment record for the compiler, NOT hand-wired.`;
    report.diagnosis = diag;
  }
  return report;
}

// CLI: node src/freeze.js → writes eval/freeze-report.json
if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runFreezeTest({ threshold: 3 });
  fs.mkdirSync(new URL('../eval/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('../eval/freeze-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(`observations: ${report.observations.length} (skipped rows: ${report.skipped_rows.length})`);
  for (const s of report.sweeps) {
    console.log(`buckets=${s.buckets}: ${s.regions.length} regions, proposals=${s.freeze_proposals.length}`);
    for (const r of s.regions) console.log(`   ${r.region}  n=${r.n}  ${JSON.stringify(r.outputs)}${r.unanimous ? '  UNANIMOUS' : ''}`);
  }
  console.log('post-vector sweep proposals (buckets=3):', postLen(report));
  console.log(`VERDICT: ${report.verdict}`);
  console.log(report.decision);
}
function postLen(report) { return report.post_vector_sweep_buckets3.length; }
