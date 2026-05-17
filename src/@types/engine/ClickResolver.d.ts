import type { ClickResolveInput } from './ClickResolveInput';
import type { ClickResolution } from './ClickResolution';

export type ClickResolver = {
  /** Resolve a click position → ClickResolution. */
  resolveClick(input: ClickResolveInput): Promise<ClickResolution>;
  /**
   * Tear down the resolver.  No-op — the resolver is a thin wrapper
   * around the pick renderer plus two pure resolution closures; its
   * dependencies (pickRenderer, resolveSelection, buildGalaxyInfo) are
   * owned by the engine and torn down separately.  Method exists so
   * the engine's bag of subsystems can be torn down uniformly via the
   * shared `Destroyable` shape (`engine.destroy()` iterates and calls
   * `destroy()` on each).
   */
  destroy(): void;
};
