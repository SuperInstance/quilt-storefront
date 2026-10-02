// src/facts.js — the storefront's rule-based FACT extraction (wave-68, lane 68-a).
//
// v2 contract (quilt-softjoints docs/fact-tone-v2.md): FACTS DECIDE OUTCOMES;
// EMOTION DECIDES TONE. This module is the storefront-domain EXTRACTOR — the
// "rules first" authority of the pipeline. Every fact carries the evidence span
// that grounded it (auditable, never guessed); when the text simply does not
// state a needed fact, the extractor returns a stated-unknown (value:null) and
// the joint's fact gate refuses to rule — extraction is IMPOSSIBLE there, not
// starved, and a model call would be the guessing the contract forbids.
//
// Policy inputs of the refunder region (the facts the OUTCOME keys on):
//   receipt-mentioned : true | false | null   (the wave-67 deciding feature)
//   purchase-window   : 'within-7' | 'over-7' | null  (manager review after 7 days)
// Context facts (receipted, ride with the moment, do NOT key the outcome):
//   item, defect-claimed

import { RLEX } from './vector.js';

const ITEMS = ['milk', 'bread', 'eggs', 'egg', 'socks', 'toaster', 'lantern'];

const RECEIPT_YES = [
  /(have|has|got|kept|keep|present|found|brought|bring)[^.]{0,25}receipt/,
  /receipt[^.]{0,25}(here|with me|in hand|attached|right here|on me)/,
  /here('s| is) the receipt/,
  /the receipt is here/,
];
const RECEIPT_NO = [
  /(no|without|lost|misplaced|never had|threw away|threw out|tossed|don'?t have|do not have|trashed)[^.]{0,25}receipt/,
  /threw (the )?receipt (away|out)/,
  /receipt[^.]{0,15}(away|out|gone|lost)/,
];

const DAYS_PATTERNS = [
  { re: /yesterday/, days: 1 },
  { re: /just (bought|picked up)|today|this morning|day one/, days: 0 },
  { re: /(\d+)\s+days? ago/, daysFn: (m) => Number(m[1]) },
  { re: /(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+days? ago/, daysFn: (m) => NUMWORDS[m[1]] },
  { re: /last week|a week ago|one week ago/, days: 7 },
  { re: /(\d+)\s+weeks? ago/, daysFn: (m) => Number(m[1]) * 7 },
  { re: /(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+weeks? ago/, daysFn: (m) => NUMWORDS[m[1]] * 7 },
  { re: /(\d+|a|an)\s+months? ago/, daysFn: (m) => (m[1] === 'a' || m[1] === 'an' ? 1 : Number(m[1])) * 30 },
  { re: /(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months? ago/, daysFn: (m) => NUMWORDS[m[1]] * 30 },
];
const NUMWORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

const DEFECT_EXTRA = ['does not work', "doesn't work", 'stopped working', 'not working', 'quit', "won't work", 'torn', 'smashed'];

function firstMatch(msg, patterns) {
  for (const re of patterns) {
    const m = msg.match(re);
    if (m) return m[0];
  }
  return null;
}

// extractRefunderFacts(message, {session}) -> Fact[] (quilt-softjoints v2 schema).
// Deterministic, rule-based, evidence-carrying. `session` facts (how:'session')
// may be injected by the host for facts the store already knows (cart, ledger);
// the rules here read ONLY the message text.
export function extractRefunderFacts(message /* , {session} = {} */) {
  const msg = String(message ?? '').toLowerCase();
  const facts = [];

  // receipt-mentioned — THE deciding feature (wave-67 diagnosis)
  if (RECEIPT_NO.some((re) => re.test(msg))) {
    facts.push({ kind: 'receipt-mentioned', value: false, evidence: firstMatch(msg, RECEIPT_NO), how: 'rule' });
  } else if (RECEIPT_YES.some((re) => re.test(msg))) {
    facts.push({ kind: 'receipt-mentioned', value: true, evidence: firstMatch(msg, RECEIPT_YES), how: 'rule' });
  } else {
    facts.push({ kind: 'receipt-mentioned', value: null, evidence: null, how: 'rule' });
  }

  // purchase-window — the manager-review boundary (after 7 days)
  let days = null;
  let dayEvidence = null;
  for (const p of DAYS_PATTERNS) {
    const m = msg.match(p.re);
    if (m) {
      days = p.daysFn ? p.daysFn(m) : p.days;
      dayEvidence = m[0];
      break;
    }
  }
  facts.push({
    kind: 'purchase-window',
    value: days === null ? null : (days > 7 ? 'over-7' : 'within-7'),
    evidence: dayEvidence === null ? null : `${dayEvidence} (${days} days)`,
    how: 'rule',
  });

  // context facts (audited, not outcome-keyed)
  const item = ITEMS.find((i) => msg.includes(i)) ?? null;
  if (item) facts.push({ kind: 'item', value: item, evidence: item, how: 'rule' });
  const defectWords = [...RLEX.defect, ...DEFECT_EXTRA];
  const defectHit = defectWords.find((w) => msg.includes(w)) ?? null;
  facts.push({ kind: 'defect-claimed', value: defectHit !== null, evidence: defectHit, how: 'rule' });

  return facts;
}

// The registry the engine resolves sheet cells' `fact_extractor` against
// (mirror of PREVECTORS — explicit, not magic).
export const FACT_EXTRACTORS = { 'refunder-facts': extractRefunderFacts };

// The kinds that KEY the outcome (the frozen-table region key). Everything else
// extracted rides in the receipt as context. The policy's outcome depends on
// exactly: receipt status (full refund vs store credit) and purchase window
// (manager review after 7 days).
export const REFUNDER_FREEZE_FACTS = ['receipt-mentioned', 'purchase-window'];

// RENDER — the deterministic customer-facing sentence per outcome class.
// A frozen row's answer is RENDERED from the evidence-backed outcome class;
// it is never model-generated and never hand-written per row.
export const RENDER = {
  'full refund': 'Good news — with your receipt you are fully covered: a full refund within 7 days, no problem at all.',
  'store credit': 'I can offer you store credit for the full value today — that is our policy when a receipt is not available.',
  'manager review': 'Since this is past the 7-day window, our manager will review it personally and make it right — let me page them for you.',
};
