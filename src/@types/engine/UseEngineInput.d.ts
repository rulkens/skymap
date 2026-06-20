import type { EngineCallbacks } from './EngineCallbacks';

/**
 * One-level deep partial — each top-level bag (lifecycle / camera / …) is
 * optional, AND each method inside the bag is also optional. Needed because
 * `useEngine` merges the caller's `extraCallbacks` into a fully-populated
 * `EngineCallbacks` object via spread, so a caller that wants to subscribe
 * to just one method in a bag (like `camera.onCameraChange`) isn't forced
 * to re-supply the ones the hook already wires up.
 */
type ExtraEngineCallbacks = {
  [K in keyof EngineCallbacks]?: EngineCallbacks[K] extends object
    ? { [M in keyof EngineCallbacks[K]]?: EngineCallbacks[K][M] }
    : EngineCallbacks[K];
};

export type UseEngineInput = {
  /**
   * Extra callbacks to layer onto the engine's options block — App-level
   * subscriptions to specific methods like `selection.onStructureHoverChange`
   * for the structure hover preview, without re-supplying the required
   * methods this hook already wires.  Captured at first render; do not
   * expect subsequent changes to take effect.
   */
  extraCallbacks?: ExtraEngineCallbacks;
};
