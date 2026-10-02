// eval/freeze-v2.js — the FACT/TONE v2 freezing test, re-run on the GROWN corpus
// (lane 68-a-r2, finishing dead lane 68-a).
//
// Wave-67 (eval/freeze-report.json): 7 live observations, 0 unanimous n≥3 regions,
// honest no-freeze, diagnosis "the deciding feature is not in the vector".
// Wave-68 design (quilt-softjoints docs/fact-tone-v2.md §6): the fact dimension is
// added to the CONTRACT; whether regions actually freeze is an empirical question
// answered by the grown corpus (n≥14) through the UNCHANGED instrument.
//
// THIS RUN: 18 synthetic refunder-region observations (eval/battery-v2.json, varied
// facts+emotion). Outcome classes are DERIVED FROM EXTRACTED FACTS BY THE WRITTEN
// POLICY — the rule path only, ZERO external model calls (receipted choice: the
// question the instrument answers is whether the FACT-KEYED regions are
// deterministic; a model would add tone, not outcomes — v2 law: facts decide
// outcomes, emotion decides tone).
//
// Two keys are swept at buckets 2/3/4 through the real freezingTest:
//   v2 key  : bucketed refunder-lexicon pre-vector + factsClass(facts, kinds=REFUNDER_FREEZE_FACTS), requireFacts:true
//   v1 key  : bucketed pre-vector only (emotion) — the contrast sweep, reported, never promoted
//
// Honest verdicts: freeze iff some fact-bearing region is unanimous at n≥threshold.
// Starved observations are counted, listed with their members, and excluded from
// proposals by the instrument itself (requireFacts). Promotion policy: the LIVE
// refunder.frozen table stays EMPTY — synthetic rule-derived rows are instrument
// evidence, not live-session evidence (evidence-or-nothing, 67-c law unchanged);
// the report lists the proposals a live corroboration would promote.
import fs from 'node:fs';
import { freezingTest } from '../../quilt-softjoints/src/decompose.js';
import { bucketVector } from '../../quilt-softjoints/src/joint.js';
import { factsClass } from '../../quilt-softjoints/src/facts.js';
import { refunderPreVector } from '../src/vector.js';
import { extractRefunderFacts, REFUNDER_FREEZE_FACTS } from '../src/facts.js';

const battery = JSON.parse(fs.readFileSync(new URL('./battery-v2.json', import.meta.url), 'utf8'));

// outcomeFromFacts — the WRITTEN POLICY as a pure function of the extracted facts.
// This is the rule path: no model, no guessing. Returns null when the policy-input
// facts do not ground an outcome (the fact-starved cohort).
export function outcomeFromFacts(facts) {
  const r = facts.find(f => f.kind === 'receipt-mentioned');
  const w = facts.find(f => f.kind === 'purchase-window');
  if (w?.value === 'over-7') return 'manager review';
  if (r?.value === true && w?.value === 'within-7') return 'full refund';
  if (r?.value === false && w?.value === 'within-7') return 'store credit';
  return null;
}

export function runFreezeV2({ threshold = 3 } = {}) {
  const obs = [];
  const starved = [];
  for (const o of battery.observations) {
    const facts = extractRefunderFacts(o.message);
    const outcome = outcomeFromFacts(facts);
    const rec = {
      id: o.id, message: o.message, emotion_note: o.emotion_note,
      facts, facts_class: facts.length ? factsClassOf(facts) : '∅facts',
      pre_vector: refunderPreVector(o.message),
      outcome, expected: o.expected ?? null,
    };
    if (outcome === null) { rec.starved_reason = o.starved_reason ?? 'policy-input facts not grounded'; starved.push(rec); }
    else {
      if (o.expected && o.expected !== outcome) rec.expected_mismatch = `battery expected ${o.expected}, policy-on-facts derived ${outcome}`;
      obs.push(rec);
    }
  }

  const v2Sweeps = [], v1Sweeps = [];
  let v2ProposalsAny = 0, starvedInProposals = 0, groundedSplits = 0, emotionOnlySplits = 0;
  for (const buckets of [2, 3, 4]) {
    const v2 = freezingTest(
      obs.map(o => ({ vector: o.pre_vector, output: o.outcome, facts: o.facts })),
      { threshold, buckets, requireFacts: true, kinds: REFUNDER_FREEZE_FACTS },
    );
    v2ProposalsAny += v2.length;
    // HONEST MEASUREMENT (murmuration law — never a constant): a starved observation
    // violates the outcome law iff its own v2 region key (emotion bucket + its
    // stated-unknown facts class) appears among the frozen proposals.
    const starvedKeys = new Set(starved.map(s =>
      `${bucketVector(s.pre_vector, buckets)}|${factsClass(s.facts, { buckets, kinds: REFUNDER_FREEZE_FACTS })}`));
    starvedInProposals += v2.filter(p => starvedKeys.has(p.region)).length;
    v2Sweeps.push({ buckets, proposals: v2, regions: regionTable(obs.map(o => ({ vector: o.pre_vector, output: o.outcome, facts: o.facts })), { threshold, buckets, requireFacts: true, kinds: REFUNDER_FREEZE_FACTS }) });
    const v1 = freezingTest(obs.map(o => ({ vector: o.pre_vector, output: o.outcome })), { threshold, buckets });
    v1Sweeps.push({ buckets, proposals: v1 });
  }
  for (const s of v2Sweeps) {
    for (const r of s.regions) if (r.n >= 2 && Object.keys(r.outputs).length > 1) groundedSplits += 1;
  }
  for (const s of v1Sweeps) {
    for (const r of regionTable(obs.map(o => ({ vector: o.pre_vector, output: o.outcome })), { threshold: threshold, buckets: s.buckets }))
      if (r.n >= 2 && Object.keys(r.outputs).length > 1) emotionOnlySplits += 1;
  }

  const b3 = v2Sweeps.find(s => s.buckets === 3);
  const report = {
    kind: 'freeze-report-v2',
    cell: 'refunder.joint',
    sheet: 'corner-store-storefront',
    at_utc: new Date().toISOString(),
    contract: 'FACT/TONE v2 (quilt-softjoints docs/fact-tone-v2.md): facts decide outcomes, emotion decides tone',
    corpus: {
      file: 'eval/battery-v2.json',
      law: battery.corpus_law,
      synthetic: true,
      observations: battery.observations.length,
      grounded: obs.length,
      fact_starved: starved.length,
      model_calls: 0,
      model_calls_note: 'rule-path-only, receipted per mission: extraction is rules (src/facts.js), outcomes are the written policy as a pure function of facts (outcomeFromFacts) — a model would add tone, not outcomes',
    },
    method: {
      v2_key: `bucketVector(refunderPreVector, B) + '|' + factsClass(facts, kinds=${JSON.stringify(REFUNDER_FREEZE_FACTS)}) — requireFacts:true (the outcome law)`,
      v1_key: 'bucketVector(refunderPreVector, B) — the wave-67 emotion-only key, swept for contrast, never promotable',
      instrument: 'freezingTest from ../quilt-softjoints/src/decompose.js (unchanged; requireFacts/kinds are the v2 additive options)',
      threshold,
      policy_rule: 'over-7 → manager review; receipt-mentioned:true + within-7 → full refund; receipt-mentioned:false + within-7 → store credit; otherwise not decidable (starved)',
    },
    grounded_observations: obs,
    fact_starved_observations: starved,
    v2_sweeps: v2Sweeps,
    v1_contrast_sweeps: v1Sweeps,
    verdict: null,
    decision: null,
    promotion_policy: 'rows are never hand-written and never promoted from synthetic evidence alone: the LIVE refunder.frozen table stays empty until a live-session run reproduces a unanimous fact-keyed region (evidence-or-nothing, 67-c law unchanged). This report lists the proposals a live corroboration would promote.',
  };

  if (v2ProposalsAny > 0) {
    report.verdict = 'freeze';
    report.decision = `${v2ProposalsAny} fact-bearing region proposal(s) across buckets 2/3/4 (buckets=3: ${b3.proposals.length}). The v2 fact key made the deciding feature VISIBLE and the regions deterministic — the wave-67 diagnosis is resolved by the grown corpus. Live promotion awaits live-session corroboration (promotion_policy).`;
    report.proposals_buckets3 = b3.proposals;
  } else {
    report.verdict = 'no-freeze';
    report.decision = `NO fact-bearing region reached unanimity at n>=${threshold} under any bucketing (2/3/4) over ${obs.length} grounded observations — the honest refusal, receipted with n. The joint stays soft.`;
  }
  report.fact_starved_reported = starved.map(s => ({ id: s.id, facts_class: s.facts_class, reason: s.starved_reason }));
  report.metrics = {
    observations: battery.observations.length,
    grounded: obs.length,
    fact_starved: starved.length,
    v2FreezeProposalsBuckets3: b3.proposals.length,
    v2FreezeProposalsAny: v2ProposalsAny,
    v2StarvedInProposals: starvedInProposals,
    groundedRegionSplits: groundedSplits,
    emotionOnlySplits,
    factKeyedDeterminism: (groundedSplits === 0 && emotionOnlySplits >= 1) ? 1 : 0,
  };
  return report;
}

function factsClassOf(facts) {
  // report-only helper (mirror of the v2 key for the audit trail)
  return [...facts].sort((a, b) => a.kind.localeCompare(b.kind)).map(f => `${f.kind}:${f.value}`).join('|');
}

function regionTable(observations, opts) {
  // the SAME region accounting freezingTest uses, exposed for the split metrics
  const regions = new Map();
  for (const o of observations) {
    const key = opts.requireFacts
      ? `${bucketVector(o.vector, opts.buckets)}|${factsClass(o.facts, { buckets: opts.buckets, kinds: opts.kinds })}`
      : bucketVector(o.vector, opts.buckets);
    if (!regions.has(key)) regions.set(key, { region: key, n: 0, outputs: {} });
    const r = regions.get(key);
    r.n += 1;
    r.outputs[o.output] = (r.outputs[o.output] || 0) + 1;
  }
  return [...regions.values()];
}

// CLI: node eval/freeze-v2.js → writes eval/freeze-report-v2.json (+ metrics file)
if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runFreezeV2({ threshold: 3 });
  fs.mkdirSync(new URL('../eval/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('../eval/freeze-report-v2.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(new URL('../eval/freeze-v2-metrics.json', import.meta.url), JSON.stringify({ metrics: report.metrics }, null, 2) + '\n');
  // scorer input for tools/preregister.mjs (fleet-seeds): it resolves the SEALED dotted
  // claim paths ("metrics.X") against results.metrics — so the transcription nests once more.
  fs.writeFileSync(new URL('../eval/freeze-v2-results.json', import.meta.url), JSON.stringify({
    metrics: { metrics: report.metrics },
    note: 'preregister@1 results transcription of eval/freeze-report-v2.json (run of eval/freeze-v2.js over eval/battery-v2.json); claim paths are metrics.X per the sealed claims file seeds/preregister-68ar2.json (fleet-seeds)',
  }, null, 2) + '\n');
  console.log(`observations: ${report.metrics.observations} (grounded ${report.metrics.grounded}, fact-starved ${report.metrics.fact_starved}, model calls: 0)`);
  for (const s of report.v2_sweeps) console.log(`v2 buckets=${s.buckets}: proposals=${s.proposals.length}${s.proposals.some(p => p.factBearing) ? ' (fact-bearing)' : ''}`);
  for (const s of report.v1_contrast_sweeps) console.log(`v1 buckets=${s.buckets}: proposals=${s.proposals.length} (emotion-only contrast)`);
  console.log('metrics:', JSON.stringify(report.metrics));
  console.log(`VERDICT: ${report.verdict}`);
  console.log(report.decision);
}
