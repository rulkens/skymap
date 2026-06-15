import type { ClickResolveInput } from './ClickResolveInput';
import type { FocusableTarget } from './FocusableTarget';

export type ClickResolver = {
  /**
   * Resolve a click position → the `FocusableTarget` it hit (a resolved
   * `GalaxyInfo` / `StructureInfo`), or null for background. The engine
   * forwards the result straight to `setSelected`, which holds it for the
   * InfoCard and the dblclick focus.
   */
  resolveClick(input: ClickResolveInput): Promise<FocusableTarget | null>;
  /**
   * Tear down the resolver.  No-op — the resolver is a thin wrapper
   * around the pick renderer plus the pick-resolution deps; its
   * dependencies are owned by the engine and torn down separately.
   * Method exists so the engine's bag of subsystems can be torn down
   * uniformly via the shared `Destroyable` shape (`engine.destroy()`
   * iterates and calls `destroy()` on each).
   */
  destroy(): void;
};
