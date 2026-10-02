# quilt-storefront

**The application artifact**: the principal's own example — a general-store digital
assistant built as a quilt, where "typesafe.ai calls and clever networks of small
models and algorithms and iterators and nexuses and hooks and drops work together to
function like they were a larger model within their domain."

**Measured: the quilt scores +2.83 over the same small model alone** (EVALUATION.md,
judged blind against ground truth, wave-67 re-run; +2.00 on wave-66) while spending
~1/3 of the model calls. It punches above its weight because its facts live in tables
and its judgment lives in soft joints.

**Freeze-test verdict (wave-67, lane 67-c): NO region froze — and that is the thesis
working.** 7 real refunder observations across two live sessions + replay receipts, 3
bucketing sweeps, 0 unanimous n≥3 regions (eval/freeze-report.json). The deciding
feature (receipt presence) is a FACT the emotional vector cannot see, and the same
message produced different outcome classes in different sessions. `refunder.frozen`
ships with an EMPTY live table (evidence or nothing); the fallback-first frozen path
is live and tested. A non-result is a result — the grind-down discipline refused to
freeze a non-deterministic region.

## Architecture (one screen)

```
 customer.message ──▶ intent.router ──┬─▶ hours.answer   (lookup)
      (sensor)        keyword nexus   ├─▶ stock.answer   (lookup)
                      + classifier    ├─▶ prices.answer  (lookup)
                      softjoint when  ├─▶ refunder.joint (softjoint: policy + tone)
                      rules can't see ├─▶ escalate.notice (hook: page-manager fires)
                                      └─▶ fallback.policy (honest default)
 cart.state ────▶ moment.vector (softjoint: the moment as a NAMED VECTOR)
 session.loop (iterator, 24-turn budget) ──▶ reply (drop: full trace per turn)
```

- **The formulaic bulk is lookup tables** (hours/stock/prices/policy) — zero model
  cost, zero hallucination, auditable.
- **The router is a NEXUS, not a decision tree**: keyword rules first (SPECIFIC
  intents before broad keywords — the rule-order law earned live in wave-67); when
  rules can't see the moment, a soft-joint classifier reads it as a vector and routes.
  This is the deliberate anti-decision-tree: the dynamic layer stays.
- **Fallback-FIRST frozen rows** (`refunder.frozen`): moments whose pre-vector region
  froze by freezing-test evidence are served from the lookup table BEFORE any model
  call — zero cost, zero latency variance. Empty table = nothing froze yet = every
  moment reaches the model. Rows are never hand-written.
- **The greeter is never decomposed** (`greeter.voice`, `greeter: true`): human
  connection is relationship value that makes everything less robotic. It has NO
  scripted fallback — degrading a greeter to a canned line is the failure mode this
  architecture exists to prevent; it degrades to silence instead.
  Wave-72 (72-b-r2): the region is **TAGGED `greeter-territory`** on receipted lift
  evidence (quilt-softjoints @ 88c6608; blind-judge lift −0.25, model 8.0 vs authored
  8.25, over the real 71-c corpus — `receipts/greeter-law-validation.json`). runJoint
  routes the tagged cell GREETER-FIRST: warmth serves authored-first
  (`greeter-lexicon`, zero calls), a miss opens the authored ask-back
  (`greeter.ask-back`), and the model seat is never spent on the region while the tag
  stands — a future lift > 0 lifts the tag (a selection rule, not a monument).
- **Every ai-bearing cell fails closed** to a lookup fallback: budget out, network
  down — the store still answers hours and prices. A fallback that REFERENCES a cell
  serves that cell's VALUE, never the raw internal reference string.

## Play-test receipts (live)

- `runs/live-session.jsonl` — the wave-66 12-turn live session: routes, vectors,
  latencies, tokens per turn.
- `runs/live-session-2.jsonl` — the wave-67 24-turn battery: every route ≥3×, five
  refund emotional registers (calm-factual / upset / furious-but-polite /
  regular-customer / first-timer), three greeter times-of-day, three ood turns.
- `runs/live-session-2-replay.jsonl` — live replays of the turns the battery broke
  (misroute fix + joint-backend fix + fallback fix), each now green.
- `runs/adjustments.jsonl` — six REAL findings recorded in the §5a schema (why +
  compiled cell each). Wave-66: the cache-collapse leak, the missing policy state.
  Wave-67: the rule-order misroute (stock's broad "have" shadowed a refund), the
  400-token truncation that fail-closed three joints in one session, the raw
  `fallback→ref` string served to a customer — and the FREEZE NON-RESULT with its
  diagnosis. Fixes land in the sheet/engine; future runs never need them again.
  That is the loop working.

## Quickstart

```bash
npm test          # 18 tests, no network (mock backends carry the invariants)
npm run session   # LIVE 12-turn session (wave-66 receipt)
npm run session2  # LIVE 24-turn battery (≤6 typesafe + ≤20 deepinfra)
npm run freeze    # the refunder freezing test → eval/freeze-report.json
npm run eval      # bare model vs quilt, judged blind vs ground truth
```

Note: `tests/0*.test.js` are the superseded draft-era suite (vendored-engine path),
kept for provenance; the canonical suite is `npm test` (`tests/*.test.mjs`).

## Lineage

- Engine vocabulary + soft-joint execution: **quilt-softjoints** (wave-66 lane 66-a,
  dogfooded — `runJoint` executes every model cell here).
- Lookup-table philosophy: **quilt-lookup** (wave-66 lane 66-d, the spreadsheet
  catalog — this store's tables are its `biz.*` recipes made real).
- Runs/adjustments schema: **wave-66 brief §5** (the quilt-runbook interop contract).

## License

MIT
