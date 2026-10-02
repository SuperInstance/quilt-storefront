// eval/greeter-demo-common.js — shared instrument for the greeter-joint demo
// (wave-71, lane 71-c). Zero network. Used by the dry-run (pre-seal) and the
// runner (post-seal) so the assertions the seal binds are the assertions the
// run re-plays, fail-closed, before any model call.
//
// The demo sheet: the LIVE storefront sheet + ONE additive lookup cell
// (greeter-lexicon: hand-authored warm lines keyed by register — the routed
// ask-back pattern of refunder.ask-receipt applied to greeter territory) + ONE
// additive router rule appended LAST (rule-order law: policy/intent keywords
// outrank warmth keywords). Nothing else is touched; assertAdditivity proves it.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { makeEngine } from '../src/engine.js';
import { extractRefunderFacts } from '../src/facts.js';
import { outcomeFromFacts } from './freeze-v2.js';

// mapAnswer — copied VERBATIM from eval/live-freeze-69a.js (lane 69-a's outcome
// mapping; importing that file would execute its whole live-freeze analysis, so
// the comparator rides here unchanged — any drift is a scoring bug, keep in sync).
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

export function sha256File(path) {
  return 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function loadEnv() {
  const env = Object.fromEntries(
    readFileSync('/home/z/my-project/.env.keys', 'utf8')
      .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );
  for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;
  return Object.keys(env); // var NAMES only — never the values
}

// ---- the demo sheet ---------------------------------------------------------
export function buildDemoSheet(liveSheet, battery) {
  const sheet = JSON.parse(JSON.stringify(liveSheet));
  const router = sheet.cells.find(c => c.kind === 'router');
  const rule = { any: battery.greeterRuleKeywords, route: 'greeter-lexicon' };
  router.rules = [...router.rules, rule]; // appended LAST — policy keywords outrank warmth
  const cell = {
    id: 'greeter-lexicon',
    kind: 'lookup',
    inputs: ['key'],
    keymap: {
      'good morning': 'morning',
      'good afternoon': 'afternoon',
      'good evening': 'evening',
      'first time': 'first-visit',
      'you know me': 'regular',
      'thanks for': 'thanks',
      'rough day': 'sympathy',
      'this weather': 'weather',
      'since i was a kid': 'nostalgia',
      'someone clearly cares': 'compliment',
      'happy holidays': 'holiday',
      'take care': 'parting',
    },
    table: { ...battery.greeterLexiconDraft },
    default: null, // the greeter no-script law: an unregistered moment degrades to SILENCE, never a canned line
    notes: 'GREETER-JOINT DEMO (wave-71 lane 71-c): the greeter path — warmth from rules, the routed ask-back pattern of refunder.ask-receipt applied to greeter territory. 12 authored register lines, zero model calls. default=null honors the greeter no-script law (silence, not a canned line) and P1 counts a silence as a complaint-level failure.',
  };
  sheet.cells = [...sheet.cells, cell];
  return { sheet, patch: { rule, cell } };
}

export function assertAdditivity(liveSheet, demoSheet, battery) {
  const liveCells = new Map(liveSheet.cells.map(c => [c.id, c]));
  const demoCells = new Map(demoSheet.cells.map(c => [c.id, c]));
  if (demoSheet.cells.length !== liveSheet.cells.length + 1) throw new Error('demo sheet: cell count drift');
  for (const [id, lc] of liveCells) {
    const dc = demoCells.get(id);
    if (!dc) throw new Error(`demo sheet: cell ${id} missing`);
    if (id !== 'intent.router') {
      if (JSON.stringify(lc) !== JSON.stringify(dc)) throw new Error(`demo sheet: cell ${id} was modified (additivity breach)`);
    } else {
      const base = JSON.parse(JSON.stringify(lc));
      base.rules = base.rules.concat([{ any: battery.greeterRuleKeywords, route: 'greeter-lexicon' }]);
      if (JSON.stringify(base) !== JSON.stringify(dc)) throw new Error('demo sheet: router drift (expected exactly ONE appended rule)');
    }
  }
  if (!demoCells.has('greeter-lexicon')) throw new Error('demo sheet: greeter-lexicon cell missing');
  if (JSON.stringify(demoSheet.meta) !== JSON.stringify(liveSheet.meta)) throw new Error('demo sheet: meta drift');
  return true;
}

// ---- dry-run assertions (zero network, re-asserted pre-run) ------------------
// Returns a per-item assertion receipt consumed by both lanes.
export async function assertBattery(demoSheet, battery) {
  const findings = { ok: true, greeter: [], controls: [] };
  const lexicon = demoSheet.cells.find(c => c.id === 'greeter-lexicon');
  const bad = (checks) => Object.values(checks).some(v => typeof v === 'string' && v.startsWith('FAIL'));

  // greeter moments: rule-routed to greeter-lexicon, correct register line, zero model
  for (const m of battery.greeterMoments) {
    const row = { id: m.id, key: m.key, checks: {} };
    const lower = String(m.message).toLowerCase();
    row.checks.ruleKeyword = battery.greeterRuleKeywords.some(k => lower.includes(k))
      ? 'ok' : `FAIL no greeter rule keyword in "${m.message}"`;
    for (const [kw, key] of Object.entries(lexicon.keymap)) {
      if (lower.includes(kw) && key !== m.key) {
        row.checks.keymapOrder = `FAIL keymap phrase "${kw}" would compete with ${m.key}`;
      }
    }
    const engine = makeEngine(demoSheet, { budget: { typesafe: 0, deepinfra: 0, judge: 0 } });
    const [t] = await engine.runSession([m.message]);
    row.checks.route = t.route === 'greeter-lexicon' ? 'ok' : `FAIL routed ${t.route} via ${t.routed_via}`;
    row.checks.zeroModel = (engine.budgetRemaining.deepinfra === 0 && engine.budgetRemaining.typesafe === 0 && t.usage == null)
      ? 'ok' : 'FAIL model spend on greeter path';
    row.checks.served = (t.answer_source === 'lookup' && typeof t.reply === 'string' && t.reply.length > 0 && t.reply === lexicon.table[m.key])
      ? 'ok' : `FAIL source=${t.answer_source} reply=${JSON.stringify(t.reply ?? null).slice(0, 60)}`;
    row.checks.lineMatchesBattery = lexicon.table[m.key] === battery.greeterLexiconDraft[m.key] ? 'ok' : 'FAIL lexicon line != battery draft';
    if (bad(row.checks)) findings.ok = false;
    findings.greeter.push(row);
  }

  // fact controls: live-rule routed, facts grounded, region classification, expected outcome
  const frozenCell = demoSheet.cells.find(c => c.id === 'refunder.frozen');
  for (const c of battery.factControls) {
    const row = { id: c.id, expectFrozen: c.expectFrozen, frozen: null, expected: null, checks: {} };
    const engine = makeEngine(demoSheet, { budget: { typesafe: 0, deepinfra: 0, judge: 0 } });
    const [t] = await engine.runSession([c.message]);
    row.checks.route = t.route === 'refunder.joint' ? 'ok' : `FAIL routed ${t.route} via ${t.routed_via}`;
    const facts = extractRefunderFacts(c.message);
    const receipt = facts.find(f => f.kind === 'receipt-mentioned')?.value ?? null;
    const window = facts.find(f => f.kind === 'purchase-window')?.value ?? null;
    row.checks.grounded = receipt !== null && window !== null ? 'ok' : `FAIL ungrounded: receipt=${receipt} window=${window}`;
    row.frozen = !!t.frozen;
    row.checks.frozenExpectation = row.frozen === c.expectFrozen ? 'ok' : `FAIL frozen=${row.frozen} expected ${c.expectFrozen}`;
    row.expected = outcomeFromFacts(facts);
    row.checks.outcome = row.expected === c.expected ? 'ok' : `FAIL outcomeFromFacts=${row.expected} battery says ${c.expected}`;
    row.checks.noGreeterKeyword = battery.greeterRuleKeywords.some(k => c.message.toLowerCase().includes(k))
      ? 'FAIL control matches a greeter keyword' : 'ok';
    if (bad(row.checks)) findings.ok = false;
    findings.controls.push(row);
  }
  // the live-frozen table at 7178b4a carries exactly the two promoted regions
  if (Object.keys(frozenCell.table || {}).length !== 2) { findings.ok = false; findings.frozenTable = `FAIL expected 2 live-frozen regions, saw ${Object.keys(frozenCell.table || {}).length}`; }
  else findings.frozenTable = 'ok(2 live-frozen regions @ 7178b4a)';
  return findings;
}
