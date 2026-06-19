/**
 * ReconcileEffects — engine-side callbacks a saga can invoke without knowing the
 * engine's internals.
 *
 * Sagas live inside the store layer and are constructed before the engine exists.
 * Coupling them directly to renderer/scheduler/fade types would entangle the store
 * with the engine's concrete implementation. Instead, the engine registers plain
 * closures here after construction (via `setSagaContext`), and sagas reach outward
 * only through this narrow surface.
 *
 * Each method represents a distinct engine concern that a saga might need to
 * trigger in response to a dispatched action:
 *   requestRender  — wakes the render-on-demand scheduler
 *   syncFades      — pushes a new visibility row set to the fade bridge
 *   reseedFlow     — reseeds the cosmic-flow particle field (e.g. on setting change)
 *   bakeBias       — re-computes the galaxy brightness bias LUT
 */

import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';
import type { BiasMode } from '../../@types/data/galaxyCatalog/BiasMode';

export type ReconcileEffects = {
  requestRender: () => void;
  syncFades: (rows: readonly VisibilityLayerKey[]) => void;
  reseedFlow: () => void;
  bakeBias: (mode: BiasMode) => void;
};
