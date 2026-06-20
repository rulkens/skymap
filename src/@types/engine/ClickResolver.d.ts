import type { ClickResolveInput } from './ClickResolveInput';
import type { SelectionRef } from './SelectionRef';

export type ClickResolver = {
  /**
   * Resolve a click position → the `SelectionRef` it hit (a positional galaxy
   * ref, a durable-id structure ref, or the milkyWay singleton), or null for
   * background. The engine forwards the result to `updateSelectionSelect`,
   * which the reconciler saga watches to fill `selectionRows`.
   */
  resolveClick(input: ClickResolveInput): Promise<SelectionRef | null>;
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
