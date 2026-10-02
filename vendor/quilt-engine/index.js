/**
 * @file index.js — PUBLIC API of the vendored quilt engine
 * @module vendor/quilt-engine
 *
 * ADAPTATION NOTE (quilt-storefront, lane 66-e, wave-66):
 * This index is REWRITTEN from the upstream `index.js` (preserved verbatim as
 * `upstream-index.js.txt`). The only change: upstream re-exports `parseSheet /
 * validateSheet / serializeSheet` from `./parser.js`, and parser.js imports the
 * external `yaml` npm package. quilt-storefront authors sheets as JSON and calls
 * `engine.loadSheet({ cells: [...] })` directly, so the YAML parser (and the
 * dependency) is dropped to keep this vendored folder fully self-contained —
 * no install step, no network. Every engine/cell module is byte-identical to
 * upstream; see PROVENANCE.md for the upstream path and patch list.
 */
export { QuiltEngine } from './engine.js';
export { emptyContext, extendContext, contextKey, evalWhen, stableJson, callKey } from './context.js';
export { evaluateValue } from './cells/value.js';
export { evaluateFormula } from './cells/formula.js';
export { evaluateApi } from './cells/api.js';
export { evaluateProgram } from './cells/program.js';
export { evaluateRouter } from './cells/router.js';
export { fireListener } from './cells/listener.js';
export { makeSensorValue } from './cells/sensor.js';
export { makeIoValue } from './cells/io.js';
export { evaluateAI } from './cells/ai.js';
export { Gesture, headingAlignment, gestureDistance } from './gesture.js';
