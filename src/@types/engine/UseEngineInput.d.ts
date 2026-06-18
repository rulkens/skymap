import type { EngineCallbacks } from './EngineCallbacks';

/**
 * One-level deep partial — each top-level bag (lifecycle / selection /
 * camera / …) is optional, AND each method inside the bag is also
 * optional.  Needed because `useEngine` merges the caller's `extraCallbacks`
 * into a fully-populated `EngineCallbacks` object via spread (e.g.
 * `selection: { onHoverChange: setHovered, onSelectChange: setSelected,
 * ...extraSelection }`), so a caller that wants to subscribe to *just*
 * one method in a required bag (like `selection.onStructureHoverChange`)
 * shouldn't be forced to also re-supply the required ones the hook
 * already wires up.
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
