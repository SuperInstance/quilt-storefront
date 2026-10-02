// src/telemetry.js — in-process receipt ledger for external calls.
// receipts/raw/ is gitignored (brief §3); a committed summary without any
// sensitive material is written by run.js / eval to receipts/external-calls-summary.json.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const RAW_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'receipts', 'raw');

export const ledger = [];

export function record(receipt) {
  const row = {
    kind: 'usage-receipt',
    lane: '66-e',
    repo: 'quilt-storefront',
    at_utc: new Date().toISOString(),
    ...receipt,
  };
  ledger.push(row);
  try {
    mkdirSync(RAW_DIR, { recursive: true });
    appendFileSync(path.join(RAW_DIR, 'external-calls.jsonl'), JSON.stringify(row) + '\n');
  } catch { /* receipting must never break the run */ }
  return row;
}

export function summarize() {
  const by = {};
  for (const r of ledger) {
    const k = `${r.provider || r.service || 'unknown'}:${r.ok === false ? 'fail' : r.external === false ? 'rejected' : 'ok'}`;
    by[k] ??= { calls: 0, tokens_in: 0, tokens_out: 0, latency_ms: 0 };
    by[k].calls += 1;
    by[k].latency_ms += r.latency_ms || 0;
    const u = r.usage || {};
    by[k].tokens_in += u.input_tokens || u.prompt_tokens || 0;
    by[k].tokens_out += u.output_tokens || u.completion_tokens || 0;
  }
  return by;
}
