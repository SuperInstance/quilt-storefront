# EVALUATION — does the quilt punch above its weight? (lane 66-e, live)

**Verdict: YES, +2.00 mean judge score over the bare model** (eval/comparison.json),
while spending ~1/3 of the model calls (2 model calls on a 6-turn battery; the rest
of the answers came from lookup tables).

Judge: nvidia/NVIDIA-Nemotron-3.5-Lightning, blind to which contender produced which
answer, order shuffled per turn, scored against GROUND TRUTH from the store's tables.

| turn | message | bare gpt-oss-20b | quilt |
|------|---------|------------------|-------|
| 1 | good morning! | 10 | 9 |
| 2 | hours on saturday? | 4 | **10** |
| 3 | do you have milk? | 10 | 10 |
| 4 | milk spoiled, upset | 6 | **8** |
| 5 | speak to a manager | 9 | **10** |
| 6 | do you carry oat flour? | 3 | **7** |
| | **mean** | 7.0 | **9.0** |

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
