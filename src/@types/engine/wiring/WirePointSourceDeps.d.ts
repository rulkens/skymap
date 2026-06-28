import type { EngineCallbacks } from '../EngineCallbacks';

/**
 * Shared dependencies the helper needs that aren't on `EngineState`.
 *
 * `cb` carries the engine's Redux store — used to dispatch
 * `engineSourceCountReported` on the slot's `ready` transition.  Passing it as one
 * named field (rather than threading individual callbacks through)
 * keeps the call site at a single line and matches how the rest of
 * the engine treats the `EngineCallbacks` value.
 */
export type WirePointSourceDeps = {
  cb: EngineCallbacks;
};
