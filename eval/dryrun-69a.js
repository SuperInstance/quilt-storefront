// eval/dryrun-69a.js — the PRE-FLIGHT receipt for the live battery (lane 69-a).
//
// Runs the ENTIRE battery design against the real rules with ZERO network:
//   1. the router nexus (sheet rule order) must route every turn to refunder.joint —
//      a single rule-miss would spend a classifier call the mission budget does not have;
//   2. the extractor (src/facts.js, the shipped rules) must ground exactly the
//      pre-registered cohorts: 8 grounded turns (T02–T09 → the model's only calls),
//      15 fact-starved (ask-back, free), 1 verbatim cache repeat (free);
//   3. the v2 region keys (bucketed refunder pre-vector + policy-input facts class)
//      must be IDENTICAL inside each cohort — the freeze test can only see unanimity
//      if the design actually lands its members in the same region.
// Exit 0 iff all three hold. This file is committed BEFORE the live session —
// the cohort design is fixed pre-run, the model's unanimity is not.
import fs from 'node:fs';
import { extractRefunderFacts, REFUNDER_FREEZE_FACTS } from '../src/facts.js';
import { refunderPreVector } from '../src/vector.js';
import { bucketVector } from '../../quilt-softjoints/src/joint.js';
import { factsClass, missingRequiredFacts } from '../../quilt-softjoints/src/facts.js';
import { outcomeFromFacts } from './freeze-v2.js';

const sheet = JSON.parse(fs.readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
const battery = JSON.parse(fs.readFileSync(new URL('./battery-69a.json', import.meta.url), 'utf8'));
const router = sheet.cells.find(c => c.id === 'intent.router');
const refunder = sheet.cells.find(c => c.id === 'refunder.joint');

let fail = 0;
const rows = [];
for (const t of battery.turns) {
  // 1. router simulation — rules first, in declared order (classifier NEVER reached)
  const text = t.message.toLowerCase();
  let route = null, via = null;
  for (const r of router.rules) {
    if (r.any && r.any.some(k => text.includes(k))) { route = r.route; via = r.any.join('|'); break; }
  }
  // 2. extraction + gate
  const facts = extractRefunderFacts(t.message);
  const missing = missingRequiredFacts(refunder.requiredFacts, facts);
  const grounded = missing.length === 0; // the gate's own law (receipt-mentioned non-null)
  // 3. v2 region key as the engine's frozen lookup computes it (buckets=3)
  const pre = refunderPreVector(t.message);
  const region = `${bucketVector(pre, 3)}|${factsClass(facts, { kinds: REFUNDER_FREEZE_FACTS })}`;
  const expected = outcomeFromFacts(facts); // the written policy on the extracted facts
  const okRoute = route === 'refunder.joint';
  // cohort law: A/B/C must GROUND (they are the model's calls); starved must NOT ground;
  // the cache turn MUST ground by extraction (identical message+facts → identical cache slot)
  const okCohort =
    (t.cohort === 'starved') ? !grounded :
    (t.cohort === 'cache') ? grounded :
    ['A', 'B', 'C'].includes(t.cohort) ? grounded : false;
  if (!okRoute || !okCohort) fail++;
  rows.push({ id: t.id, cohort: t.cohort, route, via, okRoute, grounded, okCohort, region, policy_outcome: expected, expected: t.expected ?? null, distress: pre.distress, goodwill: pre.goodwill, repeat: pre['repeat-customer'] });
}

// cohort integrity: identical region inside A, B, C
const regionConsistent = {};
for (const c of ['A', 'B', 'C']) {
  const rs = [...new Set(rows.filter(r => r.cohort === c).map(r => r.region))];
  regionConsistent[c] = rs;
  if (rs.length !== 1) fail++;
}
const groundedTurns = rows.filter(r => r.grounded).map(r => r.id);
// the cache turn grounds by extraction but spends NO call (same message+facts as T04 → same slot)
const callTurns = rows.filter(r => r.grounded && r.cohort !== 'cache').map(r => r.id);
const calls = callTurns.length;
if (calls !== 8) fail++;

// policy sanity: every grounded cohort's expected class matches policy-on-facts
for (const r of rows) {
  if (['A', 'B', 'C'].includes(r.cohort) && r.expected && r.policy_outcome !== r.expected) fail++;
}

const report = {
  kind: 'dryrun-69a',
  at_utc: new Date().toISOString(),
  network_calls: 0,
  turns: rows,
  grounded_turns: groundedTurns,
  call_turns: callTurns,
  model_calls_expected: calls,
  zero_model_turns_expected: rows.length - calls,
  cohort_regions: regionConsistent,
  ok: fail === 0,
};
fs.writeFileSync(new URL('./dryrun-69a-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
for (const r of rows) {
  console.log(`${r.id} ${r.cohort.padEnd(7)} route=${r.okRoute ? 'refund' : 'MISS:' + String(r.route)} grounded=${r.grounded ? 'YES(call)' : 'no'} policy=${String(r.policy_outcome).padEnd(14)} region=${r.region}`);
}
console.log(`\nmodel calls expected: ${calls} (must be 8) · zero-model turns: ${rows.length - calls}`);
console.log('cohort regions:', JSON.stringify(regionConsistent, null, 1));
console.log(fail === 0 ? 'DRYRUN OK — the design lands exactly as pre-registered' : `DRYRUN FAILED (${fail} violations) — fix the battery BEFORE the live run`);
process.exit(fail === 0 ? 0 : 1);
