# quilt-storefront

**The application artifact**: the principal's own example — a general-store digital
assistant built as a quilt, where "typesafe.ai calls and clever networks of small
models and algorithms and iterators and nexuses and hooks and drops work together to
function like they were a larger model within their domain."

**Measured: the quilt scores +2.00 over the same small model alone** (EVALUATION.md,
judged blind against ground truth) while spending ~1/3 of the model calls. It punches
above its weight because its facts live in tables and its judgment lives in soft joints.

## Architecture (one screen)

```
 customer.message ──▶ intent.router ──┬─▶ hours.answer   (lookup)
      (sensor)        keyword nexus   ├─▶ stock.answer   (lookup)
                      + classifier    ├─▶ prices.answer  (lookup)
                      softjoint when  ├─▶ refunder.joint (softjoint: policy + tone)
                      rules can't see ├─▶ escalate.notice (hook: page-manager fires)
                                      └─▶ fallback.policy (honest default)
 cart.state ────▶ moment.vector (softjoint: the moment as a NAMED VECTOR)
 session.loop (iterator, 12-turn budget) ──▶ reply (drop: full trace per turn)
```

- **The formulaic bulk is lookup tables** (hours/stock/prices/policy) — zero model
  cost, zero hallucination, auditable.
- **The router is a NEXUS, not a decision tree**: keyword rules first; when rules
  can't see the moment, a soft-joint classifier reads it as a vector and routes.
  This is the deliberate anti-decision-tree: the dynamic layer stays.
- **The greeter is never decomposed** (`greeter.voice`, `greeter: true`): human
  connection is relationship value that makes everything less robotic. It has NO
  scripted fallback — degrading a greeter to a canned line is the failure mode this
  architecture exists to prevent; it degrades to silence instead.
- **Every ai-bearing cell fails closed** to a lookup fallback: budget out, network
  down — the store still answers hours and prices.

## Play-test receipts (live)

- `runs/live-session.jsonl` — the 12-turn live session: routes, vectors, latencies,
  tokens per turn.
- `runs/adjustments.jsonl` — the two REAL bugs the play-test caught, recorded in the
  wave-66 adjustment schema (why + compiled cell each): the cache-collapse leak
  (greeter's answer leaked into refund turns) and the missing policy state in the
  refunder. Both fixed upstream in quilt-softjoints — future runs don't need
  these adjustments again. That is the loop working.

## Quickstart

```bash
npm test          # 10 tests, no network (mock backends carry the invariants)
npm run session   # LIVE 12-turn session (≤6 typesafe + ≤15 deepinfra budget)
npm run eval      # bare model vs quilt, judged blind vs ground truth
```

## Lineage

- Engine vocabulary + soft-joint execution: **quilt-softjoints** (wave-66 lane 66-a,
  dogfooded — `runJoint` executes every model cell here).
- Lookup-table philosophy: **quilt-lookup** (wave-66 lane 66-d, the spreadsheet
  catalog — this store's tables are its `biz.*` recipes made real).
- Runs/adjustments schema: **wave-66 brief §5** (the quilt-runbook interop contract).

## License

MIT
