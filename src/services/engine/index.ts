/**
 * Engine package barrel.
 *
 * The engine was split out of a single `src/engine.ts` into focused modules
 * under `src/services/engine/`.  Consumers (App.tsx, tests) import from this
 * barrel rather than reaching into the internals — that keeps the public
 * surface explicit and lets us reshape the internals freely.
 *
 * Public surface:
 *   - `createEngine` — factory that boots the WebGPU engine on a canvas
 *   - `autoLodMask`  — the LOD heuristic (also used directly in tests)
 *
 * Type re-exports (`EngineHandle`, etc.) are intentionally NOT here — the
 * project keeps types in `src/@types`, and consumers import them from there.
 */

export { createEngine } from './engine';
export { autoLodMask } from './helpers/autoLod';
