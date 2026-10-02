# PROVENANCE.md — vendored quilt engine

**What is vendored:** the compiled `@quilt/core` reactive cell engine (ESM, zero
dependencies) that powers every cell in `sheets/storefront.json`.

**Upstream path:** `/home/z/my-project/download/quilt-arena/engine/`
(local checkout of https://github.com/SuperInstance/quilt @ `fdfed69` upstream main,
playtest copy at local commit `adb2cd3` / workspace uuid `6070f58a-…`).

**Version identity:** `quilt-core-vendored 0.1.0-playtest` = upstream dist **plus
playtest patches 1–12** (36/36 upstream core tests green with the patches). The patch
list is documented in the upstream folder's own `PROVENANCE.md`; the patches that
matter most to this repo:

- patch 1: listener `watch` lists are wired into the dependency graph (listeners
  actually fire on sensor pushes — our `listener.escalate_hook` depends on this);
- patch 4: listener actions fire with a fresh event context carrying
  `caller.metadata.{changed, prev, current}`;
- patch 9: `evaluateFormula` persists the computed value on the cell (pulls seed the
  graph — important for AI-prompt `{{cell}}` resolution);
- patch 11: programs receive a context-bound runtime (nested `runtime.call` threads
  the caller context through the router nexus);
- patch 12: effectful cells evaluate FRESH by default, memoization is opt-in —
  the storefront's per-turn AI calls would otherwise be served stale.

**Files vendored verbatim (byte-identical):**
`engine.js`, `context.js`, `types.js`, `gesture.js`,
`cells/{value,formula,api,program,router,listener,sensor,io,ai}.js`.

**Files adapted (one):** `index.js` — rewritten to drop the `./parser.js` re-export
because upstream parser.js imports the external `yaml` npm package. This repo loads
sheets as JSON via `engine.loadSheet({ cells: [...] })` and needs no YAML. The
upstream index is preserved verbatim as `upstream-index.js.txt` for diffing.

**Not vendored:** `parser.js` (+ `.d.ts` / sourcemaps), the upstream test suite, and
the upstream CLI/MCP layers — none are needed by the storefront artifact.

**Verification duty (per wave-66 brief §1, "iron sharpens iron"):** if you change
anything inside `vendor/quilt-engine/`, you are no longer running the proven engine —
bump this file, state the diff, and re-run `node --test tests/` before pushing.
