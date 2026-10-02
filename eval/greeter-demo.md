# THE GREETER-JOINT DEMO — the wrong-joint tell, measured (wave-71, lane 71-c)

The open falsifier from the 68-e fiction-first audit, answering bobbin's round-1
question (wardroom rounds/01/bobbin.md, verbatim):

> **when you cut a job into tables-plus-a-model, what's the tell that you
> seated the model at the wrong joint?**

The answer this demo tests, built on Mavis's numbers (rounds/02/bobbin.md: judges
agree with each other at κ 0.74–0.88 but with outcomes at ~0.2 — agreement is not
evidence): **the wrong joint shows up as high agreement-with-table and no outcome
lift — a second socially-correlated vote, paid for twice.** The greeter joint is
where that tell should be sharpest, because greeter territory has no outcome to
lift: the store's own wiring (FACT/TONE v2 @ 7178b4a, first live freeze) already
serves warm moments from routed ask-backs — `refunder.ask-receipt` is a
hand-authored warm line served by rule at zero model cost. That is the greeter
law in code. The demo measures whether a MODEL seated at the greeter joint beats
it — the thesis predicts no.

## The three arms (one battery, three joints)

Battery: `eval/greeter-battery.json` — **12 greeter moments** (emotional,
low-stakes, no policy ruling needed: greetings, thanks, sympathy, chit-chat,
nostalgia, parting — one authored register line each) + **6 fact-bearing
controls** (refund moments, fully grounded facts, expected outcomes derived from
the written policy via `outcomeFromFacts`).

- **ARM A — the greeter path (the greeter joint, ZERO model calls).** The 12
  greeter moments run through the store's own engine on a demo sheet that differs
  from the live sheet by ONE additive cell (`greeter-lexicon`: 12 hand-authored
  warm lines keyed by register) and ONE additive router rule appended LAST (the
  rule-order law: policy/intent keywords outrank warmth keywords). Warmth from
  rules, exactly like `refunder.ask-receipt`. Engine budgets {typesafe:0,
  deepinfra:0}: any model attempt fails closed and counts as a complaint-level
  failure. `greeter-lexicon.default = null` — the no-script law holds on the demo
  path too: an unmatched greeter moment degrades to SILENCE, not a canned line,
  and P1 counts it as a failure.
- **ARM B — the wrong-joint control.** The SAME moments handed to the model seat
  exactly as the store wires it: `runJoint(sheet, 'greeter.voice', …)` with
  `greeter.voice`'s own prompt and the storefront-native deepinfra backend
  (gpt-oss-20b, the seat the router's classifier feeds today). Budget-capped
  subsample, **pre-registered: G01, G05, G07, G08** (greeting / regular /
  sympathy / weather-chit-chat — the four families where warmth matters most).
  Measured: blind-judged warmth+correctness vs the greeter path's line for the
  same moment, plus cost (tokens, latency) and failure modes (silences).
- **ARM C — the joint where the model earns its seat.** The 6 fact-bearing
  controls through the FULL v2 pipeline: router rule → fact extraction pre-step
  → factRequired gate → fallback-first frozen lookup → live `refunder.joint`
  (deepinfra, 1 call budgeted — only a control whose region did NOT freeze
  reaches the model). Scoring is mechanical: `mapAnswer(answer) ==
  outcomeFromFacts(facts)` — the wave-69-a accounting, unchanged.

## Budget (pre-registered reading)

Mission cap: **≤6 model calls total, receipt each.** Allocation: ARM A 0,
ARM B 4 (one per pre-registered subsample moment), ARM C 1 (the un-frozen
control C03; the other 5 land in the two live-frozen regions and must serve at
zero cost — a second live reach would fail closed on budget and count as a
ruling failure), judge 1 (blind). The judge rides
`nvidia/NVIDIA-Nemotron-3.5-Lightning` (the wave-66/67 racing horse; bounded
tokens, receipted) at temperature 0.

## The blind judge (1 call)

One deepinfra call scores all items blind: for each ARM B moment the judge sees
the customer message, the ground truth ("no facts at stake; a warm, natural,
honest line scores high; silence, robotic text, invented store facts, or policy
talk where none is needed score low") and TWO candidate replies labelled A/B —
letter assignment seeded per pair (`(i*7+3) % 2`), never shown the source. The 8
greeter-path-only moments ride along as singletons (informational warmth read on
the authored lexicon; not a sealed claim). Output STRICT JSON, parsed fail-closed
— an unparseable judge sheet leaves P2 PENDING, never guessed.

## Pre-registered predictions (fleet-seeds tools/preregister.mjs, sealed before any call)

- **P1** `greeterServedClean >= 11` (of 12): the greeter path serves the moment
  with a non-empty authored line, correct route, zero model calls. A silence, a
  misroute, or any model spend is a complaint-level failure. *(Zero-call warmth
  is enough — the model's seat adds nothing the rules lack.)*
- **P2** `judgeModelMinusGreeterMean <= 0`: across the blind pairs the model's
  greeter lines rate at or below the authored lines — **the model adds no warmth
  on greeter territory**. Vacuous if 0 usable pairs (every model call failed):
  VACUOUS, receipted — never silently passed.
- **P3** `factControlsRuledCorrect >= 5` (of 6): fact-bearing moments rule
  correctly via the joint — frozen rows and the one live ruling alike. This is
  the contrast arm: same battery, same lane, and on fact territory the seat
  earns its keep (distilled rows replay correct; the live model still rules the
  un-frozen region correctly).

If P2 FAILS (the judge rates the model's greeter lines ABOVE the authored ones),
that is the honest refutation: the model DOES add warmth at this joint, and the
store's greeter law (`greeter.voice` as a model cell) stands strengthened — the
demo publishes that with the same care.

## Run order & receipts

1. dry-run (zero network): route/key/region assertions + battery sha256 (binds
   the battery into the seal);
2. seal → commit → push (fleet-seeds) BEFORE any call; pre-run artifacts pushed;
3. ARM A (0 calls) → ARM B (4) → ARM C (1) → judge (1); every call receipted
   (provider, model, purpose, tokens, latency) in `runs/greeter-demo-*.jsonl` +
   `eval/greeter-demo-results.json`;
4. `preregister score` → verdict beside untouched claims; verdict section below
   filled with numbers; wardroom note posted.

## VERDICT (filled after the run — see results + verdict.json for the receipt)

- P1: **PENDING** (not yet run)
- P2: **PENDING** (not yet run)
- P3: **PENDING** (not yet run)

**The tell in one measured sentence:** *pending the run.*
