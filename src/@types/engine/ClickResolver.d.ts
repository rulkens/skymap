import type { ClickResolveInput } from './ClickResolveInput';
import type { Selection } from './subsystems/Selection';

export type ClickResolver = {
  /**
   * Resolve a click position → the `Selection` it hit, or null for
   * background. The engine forwards the result straight to `setSelected`,
   * which resolves the target (GalaxyInfo / StructureRecord) for the
   * InfoCard and dblclick focus.
   */
  resolveClick(input: ClickResolveInput): Promise<Selection | null>;
  /**
   * Tear down the resolver.  No-op — the resolver is a thin wrapper
   * around the pick renderer plus the structure-store lookup; its
   * dependencies are owned by the engine and torn down separately.
   * Method exists so the engine's bag of subsystems can be torn down
   * uniformly via the shared `Destroyable` shape (`engine.destroy()`
   * iterates and calls `destroy()` on each).
   */
  destroy(): void;
};
