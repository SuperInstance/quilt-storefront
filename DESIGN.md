# DESIGN — quilt-storefront (wave-66, lane 66-e)

## Ideation pass (architectures considered)

1. **Single big-model loop** — one capable model holds the whole conversation.
   Rejected: expensive per turn, inconsistent on facts (hours/prices drift), and
   the warmth it produces is synthetic rather than preserved. Also exactly what the
   principal wants to move AWAY from: one monolith instead of a quilt.

2. **Decision trees only** — every intent enumerated, every answer scripted.
   Rejected by the principal explicitly: branches see values, not moments; the
   assistant becomes robotic; edge cases (a distressed regular vs a browsing
   tourist asking the same refund question) get identical canned answers.

3. **Hybrid quilt (chosen)**: keyword-rule nexus over lookup tables for the
   formulaic bulk + soft joints (small models reading the moment as NAMED VECTORS)
   for judgment + a greeter that stays dynamic BY LAW. Measured result: +2.00 mean
   judge score over the bare small model, at ~1/3 the model calls (EVALUATION.md).

## Key design decisions

**The router is a nexus, not a tree.** Keyword rules handle the predictable bulk
(auditable, free, fast); when no rule matches, `intent.joint` classifies with a
typesafe `choice` question whose criteria ARE the route names — and reads the
moment vector in the same call. The default route is an honest "here's what I can
do" cell, never a guess.

**The greeter has no fallback.** Every other ai-bearing cell fails closed to a
lookup. The greeter fails to SILENCE. A canned greeting is worse than no greeting —
it's the robotic tell. This asymmetry is intentional and tested.

**Vectors where they pay.** `moment.vector` (urgency/familiarity/sentiment/formality)
is read once per ambiguous turn and travels with the trace; the refunder reads its
own joint (distress/goodwill/repeat-customer). Vectors are not decoration: the
freezing test (quilt-softjoints) consumes them to propose lookup promotions — the
assistant's dynamic surface shrinks toward tables on evidence.

**Tables are the truth layer.** Ground-truth judging proved it: the quilt's wins
were exactly on turns where truth lived in a table (hours, policy, stock honesty).
The eval's methodology fix (judge against ground truth, not vibes) is committed as
a fleet lesson: blind LLM judges reward confabulation.

## The play-test loop, demonstrated for real

The live session caught two bugs (runs/adjustments.jsonl, wave-66 §5a schema):
1. **Cache-collapse leak** — greeter's cached answer served refund turns because
   unvectorized moments all bucketed to one cache key. Fixed in quilt-softjoints
   `runJoint`: unvectorized moments cache by exact state hash. Compiled cell:
   `cache-law-distinct-unvectorized`.
2. **Missing policy state** — the refunder joint declared `refund-policy` as an
   input but the executor never resolved it into the state. Fixed in the engine:
   declared lookup inputs resolve into the joint's moment. Compiled cell:
   `softjoint-input-resolution`.

Both fixes are UPSTREAM (quilt-softjoints + engine.js) — the next run of this store,
or any other quilt using runJoint, never needs these adjustments again. The run
log's adjustments became cells; the loop is closed and receipted.

## Engine provenance & alternatives

`src/engine.js` is a small dedicated runner (~200 lines) rather than the arena
engine (download/quilt-arena/engine): the arena engine's ai cells are provider-wired
(zai/kimi/deepseek/cloudflare) and its parser is YAML-first; the storefront needed
typesafe-systemone semantics (choices/criteria questions), soft-joint fallbacks, and
JSON sheets shared with the wave-66 schema. Trade-off receipted: we give up the
arena engine's gesture math and caller-context memoization (not needed here) and
gain one file a stranger can fully read. Revisit if the store grows federation.

## What the next wave should consume

- quilt-runbook (66-c): adopt `runs/adjustments.jsonl` as its first real producer
  (the schema matches §5a by construction).
- The session trace + judge protocol here is the template for play-testing OTHER
  domains: battery + ground truth + blind judge + budget receipts.
- Freeze-test the greeter's vectors on real sessions — greeter stays, but its
  DOWNSTREAM cells (refund tone bands) may table-ize. Measure, don't assume.
