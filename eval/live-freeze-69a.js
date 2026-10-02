// eval/live-freeze-69a.js — the v2 freezing test, re-run on LIVE SESSION EVIDENCE
// (lane 69-a, the deferred loop: "one live 24-turn refunder session re-running the
// v2 accounting promotes real frozen rows" — the 68-a-r2 finisher's next-lane note).
//
// INPUT: runs/live-session-3.jsonl — the live trace (every turn receipts its
// extracted facts, answer source, usage). No battery JSON is trusted here: the
// corpus is what the LIVE pipeline actually did.
//
// THE INSTRUMENT (unchanged): quilt-softjoints freezingTest at threshold 3,
// buckets 2/3/4 — v2 key (requireFacts:true, kinds=REFUNDER_FREEZE_FACTS) with the
// v1 emotion-only key swept for contrast. The OUTCOME of a live observation is the
// class the MODEL actually ruled, mapped from its answer text (first-match by
// position; ambiguity receipted; unparseable receipted and excluded — never guessed).
//
// PROMOTION LAW (this is the first live freeze of the thesis):
//   a buckets=3 proposal is PROMOTABLE into sheets/storefront.json refunder.frozen iff
//     (a) factBearing (the instrument's own requireFacts law),
//     (b) every policy-input fact grounded in the region's class (no stated-unknown keys),
//     (c) the unanimous output EQUALS the written policy on those facts
//         (outcomeFromFacts — facts decide outcomes; a unanimous-but-wrong region is
//         a model-behavior finding, receipted, never frozen),
//     (d) the zero-call replay (eval/promote-69a.js) serves the row as frozen-lookup.
//   Everything else is receipted with exact per-region n and output counts — the
//   honest n<min counts the mission demands. refunder.frozen stays empty unless the
//   law is met (evidence or nothing, 67-c law unchanged).
//
// ACCOUNTING: rule-path only (this script makes ZERO external calls); the session's
// call receipts are transcribed from the trace usage. No judge eval this lane (the
// ≤8-call budget is spent on the rulings themselves) — the +2.83 wave-67 baseline
// stands untouched, delta N/A, receipted.
import fs from 'node:fs';
import { freezingTest } from '../../quilt-softjoints/src/decompose.js';
import { bucketVector } from '../../quilt-softjoints/src/joint.js';
import { factsClass } from '../../quilt-softjoints/src/facts.js';
import { refunderPreVector } from '../src/vector.js';
import { extractRefunderFacts, REFUNDER_FREEZE_FACTS, RENDER } from '../src/facts.js';
import { outcomeFromFacts } from './freeze-v2.js';

const TRACE = new URL('../runs/live-session-3.jsonl', import.meta.url);
const turns = fs.readFileSync(TRACE, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

// ---- outcome mapping: the model's answer text → policy outcome class ----------
export function mapAnswer(answer) {
  const text = String(answer ?? '');
  const hits = [];
  for (const [cls, re] of [
    ['full refund', /full refund/i],
    ['store credit', /store credit/i],
    ['manager review', /manager review|manager will|manager can/i],
  ]) {
    const m = text.match(re);
    if (m) hits.push({ cls, at: m.index });
  }
  if (hits.length === 0) return { cls: null, ambiguous: false, hits };
  hits.sort((a, b) => a.at - b.at);
  return { cls: hits[0].cls, ambiguous: hits.length > 1, hits: hits.map(h => h.cls) };
}

// ---- build the LIVE corpus -----------------------------------------------------
const rulings = [], starved = [], cacheHits = [], failClosed = [], unmapped = [];
let zeroModelTurns = 0, askBackFires = 0, askBackRetryGrounded = 0;
for (let i = 0; i < turns.length; i++) {
  const t = turns[i];
  const isModelCall = t.answer_source === 'deepinfra-chat';
  const isCache = t.answer_source === 'cache';
  if (!isModelCall && !isCache) zeroModelTurns += 1; // lookup / fact-refused / fallback / fail-closed
  if (t.fact_refused) {
    askBackFires += 1;
    const nxt = turns[i + 1];
    if (nxt && nxt.answer_source === 'deepinfra-chat') askBackRetryGrounded += 1;
    starved.push({
      id: `T${String(t.turn).padStart(2, '0')}`, message: t.message,
      facts: t.facts, facts_class: factsClass(t.facts, { kinds: REFUNDER_FREEZE_FACTS }),
      routed_to: t.routed_to, missing_facts: t.missing_facts,
      region_key_if_it_had_one: `${bucketVector(refunderPreVector(t.message), 3)}|${factsClass(t.facts, { kinds: REFUNDER_FREEZE_FACTS })}`,
    });
    continue;
  }
  if (isCache) { cacheHits.push({ turn: t.turn, note: 'in-session cache served the repeat of T04 — same ruling, no new evidence, excluded from the corpus' }); continue; }
  if (isModelCall) {
    const m = mapAnswer(t.reply);
    const rec = {
      id: `T${String(t.turn).padStart(2, '0')}`, message: t.message,
      facts: t.facts, facts_class: factsClass(t.facts, { kinds: REFUNDER_FREEZE_FACTS }),
      pre_vector: refunderPreVector(t.message),
      answer: t.reply, mapped: m.cls, ambiguous: m.ambiguous, hits: m.hits,
      usage: t.usage ?? null, latency_ms: t.latency_ms ?? null,
      policy_outcome: outcomeFromFacts(t.facts),
      policy_match: m.cls !== null && m.cls === outcomeFromFacts(t.facts),
    };
    if (m.cls === null) { unmapped.push(rec); continue; }
    rulings.push(rec);
    continue;
  }
  failClosed.push({ turn: t.turn, source: t.answer_source, reason: t.fallback_reason ?? null });
}

// ---- the sweeps (the UNCHANGED instrument) --------------------------------------
function regionTable(observations, opts) {
  const regions = new Map();
  for (const o of observations) {
    const key = opts.requireFacts
      ? `${bucketVector(o.pre_vector, opts.buckets)}|${factsClass(o.facts, { buckets: opts.buckets, kinds: opts.kinds })}`
      : bucketVector(o.pre_vector, opts.buckets);
    if (!regions.has(key)) regions.set(key, { region: key, n: 0, outputs: {}, members: [] });
    const r = regions.get(key);
    r.n += 1;
    r.outputs[o.mapped] = (r.outputs[o.mapped] || 0) + 1;
    r.members.push(o.id);
  }
  return [...regions.values()];
}

const v2Sweeps = [], v1Sweeps = [];
let v2ProposalsAny = 0, starvedInProposals = 0;
for (const buckets of [2, 3, 4]) {
  const v2 = freezingTest(
    rulings.map(o => ({ vector: o.pre_vector, output: o.mapped, facts: o.facts })),
    { threshold: 3, buckets, requireFacts: true, kinds: REFUNDER_FREEZE_FACTS },
  );
  const starvedKeys = new Set(starved.map(s =>
    `${bucketVector(refunderPreVector(s.message), buckets)}|${factsClass(s.facts, { buckets, kinds: REFUNDER_FREEZE_FACTS })}`));
  starvedInProposals += v2.filter(p => starvedKeys.has(p.region)).length;
  v2Sweeps.push({ buckets, proposals: v2, regions: regionTable(rulings, { buckets, requireFacts: true, kinds: REFUNDER_FREEZE_FACTS }) });
  const v1 = freezingTest(rulings.map(o => ({ vector: o.pre_vector, output: o.mapped })), { threshold: 3, buckets });
  v1Sweeps.push({ buckets, proposals: v1, regions: regionTable(rulings, { buckets, requireFacts: false }) });
  v2ProposalsAny += v2.length;
}

// ---- promotion eligibility (the law, applied) ------------------------------------
const b3 = v2Sweeps.find(s => s.buckets === 3);
const promotable = [], withheld = [];
for (const p of b3.proposals) {
  const members = rulings.filter(o => {
    const key = `${bucketVector(o.pre_vector, 3)}|${o.facts_class}`;
    return key === p.region;
  });
  const allGrounded = members.length > 0 && members.every(o => !/:null/.test(o.facts_class));
  const policyConsistent = members.length > 0 && members.every(o => o.policy_match);
  const rec = {
    region: p.region, output: p.output, n: p.n, members: members.map(m => m.id),
    all_policy_inputs_grounded: allGrounded,
    policy_consistent: policyConsistent,
    answer: RENDER[p.output] ?? null,
  };
  if (allGrounded && policyConsistent && RENDER[p.output]) promotable.push(rec);
  else withheld.push({ ...rec, withheld_reason: !allGrounded ? 'stated-unknown policy-input in the region key' : !policyConsistent ? 'unanimous output CONTRADICTS the written policy on those facts' : 'no RENDER sentence for the class' });
}

// ---- report -----------------------------------------------------------------------
const spend = rulings.reduce((a, o) => ({ tokens_in: a.tokens_in + (o.usage?.prompt_tokens ?? 0), tokens_out: a.tokens_out + (o.usage?.completion_tokens ?? 0) }), { tokens_in: 0, tokens_out: 0 });
const report = {
  kind: 'freeze-live-report-69a',
  cell: 'refunder.joint',
  sheet: 'corner-store-storefront',
  at_utc: new Date().toISOString(),
  contract: 'FACT/TONE v2: facts decide outcomes, emotion decides tone — the LIVE accounting',
  corpus: {
    source: 'runs/live-session-3.jsonl',
    live: true,
    synthetic: false,
    turns: turns.length,
    model_rulings: rulings.length,
    fact_starved_refused: starved.length,
    cache_served: cacheHits.length,
    fail_closed: failClosed.length,
    unparseable_rulings: unmapped.length,
    zero_model_turns: zeroModelTurns,
    model_calls_ok: rulings.length,
    model_calls_failed: failClosed.filter(f => String(f.reason).startsWith('backend-failed')).length,
    tokens_in: spend.tokens_in,
    tokens_out: spend.tokens_out,
    judge_eval: 'NOT RUN — the ≤8-call mission budget is spent on the rulings themselves; the +2.83 wave-67 baseline stands, delta N/A (receipted)',
  },
  method: {
    instrument: 'freezingTest from ../quilt-softjoints/src/decompose.js (unchanged), threshold 3, buckets 2/3/4',
    v2_key: `bucketVector(refunderPreVector, B) + '|' + factsClass(facts, kinds=${JSON.stringify(REFUNDER_FREEZE_FACTS)}), requireFacts:true`,
    v1_key: 'bucketVector(pre-vector) — emotion-only contrast, never promotable',
    outcome_mapping: 'first-match by position over the answer text (full refund | store credit | manager review); ambiguity and unparseables receipted, never guessed',
    promotion_law: 'buckets=3 + factBearing + all policy inputs grounded + unanimous output == written policy + zero-call replay serves the row',
  },
  live_rulings: rulings,
  fact_starved_live: starved,
  cache_served_live: cacheHits,
  fail_closed_live: failClosed,
  unparseable_live: unmapped.map(u => ({ id: u.id, answer: u.answer })),
  v2_sweeps: v2Sweeps,
  v1_contrast_sweeps: v1Sweeps,
  promotable_proposals: promotable,
  withheld_proposals: withheld,
  metrics: {
    turnsRun: turns.length,
    groundedRulings: rulings.length,
    unparseableRulings: unmapped.length,
    starvedRefused: starved.length,
    cacheHits: cacheHits.length,
    failClosed: failClosed.length,
    zeroModelTurns,
    askBackFires,
    askBackRetryGrounded,
    liveFreezeProposalsBuckets3: b3.proposals.length,
    liveFreezeProposalsAny: v2ProposalsAny,
    liveFreezePromotable: promotable.length,
    starvedInProposals,
    minFactBearingRegionN: Math.min(...v2Sweeps.find(s => s.buckets === 3).regions.map(r => r.n)),
    modelCallsOk: rulings.length,
    modelCallsFailed: failClosed.filter(f => String(f.reason).startsWith('backend-failed')).length,
    tokensIn: spend.tokens_in,
    tokensOut: spend.tokens_out,
  },
  verdict: null,
  decision: null,
};
const promoteCount = promotable.length;
if (promoteCount > 0) {
  report.verdict = 'freeze';
  report.decision = `${promoteCount} LIVE fact-bearing region(s) reached unanimous n>=3 at buckets=3, grounded and policy-consistent — the FIRST LIVE FREEZE of the thesis. Promotion + zero-call replay: eval/promote-69a.js.`;
} else if (b3.proposals.length > 0) {
  report.verdict = 'no-promotion';
  report.decision = `${b3.proposals.length} unanimous buckets=3 region(s) but none promotable under the law (see withheld_proposals) — receipted, nothing frozen.`;
} else {
  const regionNs = b3.regions.map(r => `${r.region.slice(0, 60)}… n=${r.n} outputs=${JSON.stringify(r.outputs)}`);
  report.verdict = 'no-freeze';
  report.decision = `NO live fact-bearing region reached unanimity at n>=3 (buckets=3) — the honest refusal, receipted with exact counts: ${regionNs.join(' ; ')}. The joint stays soft; refunder.frozen stays empty (evidence or nothing).`;
}
fs.writeFileSync(new URL('./freeze-live-report-69a.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
// prereg scorer input (dotted paths resolve under metrics.live69.*)
fs.writeFileSync(new URL('./freeze-live-results-69a.json', import.meta.url), JSON.stringify({
  metrics: { live69: report.metrics },
  note: 'preregister@1 results transcription of eval/freeze-live-report-69a.json (lane 69-a live session over runs/live-session-3.jsonl); claim paths are live69.* per the sealed claims file seeds/preregister-69a.json (fleet-seeds)',
}, null, 2) + '\n');

console.log(`turns=${report.metrics.turnsRun} rulings=${rulings.length} starved=${starved.length} cache=${cacheHits.length} failClosed=${failClosed.length} zeroModel=${zeroModelTurns}`);
console.log('metrics:', JSON.stringify(report.metrics));
for (const s of v2Sweeps) console.log(`v2 buckets=${s.buckets}: proposals=${s.proposals.length}`);
for (const s of v1Sweeps) console.log(`v1 buckets=${s.buckets}: proposals=${s.proposals.length} (emotion-only contrast)`);
console.log('promotable:', JSON.stringify(promotable, null, 1));
console.log(`VERDICT: ${report.verdict}`);
console.log(report.decision);
