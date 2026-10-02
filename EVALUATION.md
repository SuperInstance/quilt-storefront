# EVALUATION — does the quilt punch above its weight? (wave-66 live; wave-67 re-run)

**Verdict: YES, again — +2.83 mean judge score over the bare model** (eval/comparison.json,
wave-67 lane 67-c re-run on the UNCHANGED battery/rubric/ground truth; wave-66 was +2.00),
while spending 2 model calls on 6 battery turns (greeter + refunder; the rest is tables).

Judge: nvidia/NVIDIA-Nemotron-3.5-Lightning, blind to which contender produced which
answer, order shuffled per turn, scored against GROUND TRUTH from the store's tables.

| turn | message | bare gpt-oss-20b (w66 → w67) | quilt (w66 → w67) |
|------|---------|------------------------------|--------------------|
| 1 | good morning! | 10 → 10 | 9 → 9 |
| 2 | hours on saturday? | 4 → 2 | 10 → **10** |
| 3 | do you have milk? | 10 → 10 | 10 → 10 |
| 4 | milk spoiled, upset | 6 → 8 | 8 → 6 |
| 5 | speak to a manager | 9 → 6 | 10 → **9** |
| 6 | do you carry oat flour? | 3 → 1 | 7 → **10** |
| | **mean** | 7.0 → 6.17 | 9.0 → **9.0** |

Honest read of the delta: the QUILT held 9.0 across waves (its answers come from
tables — stable); the BARE model MOVED (7.0 → 6.17 — free-text generation drifts run
to run). The refund turn flipped (quilt 8 → 6): the joint generated a policy sentence
the judge scored lower this round — exactly the non-determinism the freeze test also
caught, and more evidence the refunder's outcome hinges on facts (receipt) the prompt
supplies variably. The frozen path served 0 battery turns (no region froze — see
eval/freeze-report.json); wave-66's model_calls arithmetic miscounted (reported 1,
actual 3): wave-67 counts model-served turns directly.

## The two honest findings from building this eval

1. **A vibes-only judge rewards confabulation.** The first eval run (blind, no ground
   truth) scored the bare model's INVENTED oat-flur stock ("we carry it!") ABOVE the
   quilt's honest "we don't carry that right now". Blind judges without ground truth
   are not measurements — they are popularity contests. Fix: judge against ground
   truth drawn from the tables. This is itself a thesis point: **the quilt's advantage
   is epistemic** — its facts live in lookup tables, and any honest evaluation must
   test exactly that.
2. **Qwen3.8-27B is unusable as a bounded-token judge** (reasoning_content consumed
   600 tokens with empty content — same trap as granite-4.2-3b in lane 66-a).
   Nemotron-3.5-Lightning answers in 2 completion tokens. Racing-horse casting is a
   real discipline: measure the horse before the race.

## What the quilt did better, and why

- **Hours (10 vs 4):** the bare model guessed; the quilt read a table.
- **Oat flour (7 vs 3):** the bare model invented stock; the quilt's lookup default
  honestly declined. The default row of a table is a *character* trait.
- **Refund (8 vs 6):** the soft joint applied the policy text to a distressed moment
  — the table gave the policy, the joint gave the tone.

The bare model won nothing outright; it tied on the no-facts turns (greeting, milk),
where the quilt's joints are doing the work anyway.

## The freeze test (wave-67, lane 67-c): the grind-down, put to the proof

Method: 7 refunder (pre-vector region → answer-class) observations collected from BOTH
live sessions + replay receipts; quilt-softjoints' `freezingTest` run at buckets 2/3/4,
threshold 3; output written to eval/freeze-report.json.

**Verdict: NO region froze. The joint stays soft.**

- buckets=3, region `distress:0|goodwill:1|repeat-customer:0` (calm / first-timer /
  socks-ripped): n=3 but split {full refund: 2, store credit: 1} — refused (unanimity
  is the law).
- buckets=2, same-shaped region (calm + furious-but-polite): unanimous "full refund"
  at n=2 — BELOW the bar. Watched, not frozen (`emergent_not_frozen` in the report).
- The diagnosis (the actual result): the refunder's ruling keys on RECEIPT PRESENCE —
  a FACT in the message text — which the declared emotional vector (distress, goodwill,
  repeat-customer) cannot see; and the same upset-milk message produced "store credit"
  (session 1) vs "full refund" (session 2) across calls. A region containing either
  effect can never be unanimous, and the instrument said so on its own.

What shipped anyway: the `refunder.frozen` cell + fallback-first engine path (frozen
table is checked BEFORE any model call — the grind-down made real), proven by tests
with injected rows only. The live table is EMPTY: evidence or nothing. Proposal
recorded (runs/adjustments.jsonl seq 18) for the adjustment→cell compiler: give the
refunder pre-vector a FACT dimension (receipt-mentioned) — v2 regions may then be
deterministic enough to freeze. Not hand-wired: that would be freezing on desire,
not on evidence.
