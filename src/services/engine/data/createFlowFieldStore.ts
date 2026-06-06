import type { FlowFieldStore } from '../../../@types/engine/data/FlowFieldStore';

/**
 * createFlowFieldStore — factory for the flow-field layer's status store.
 *
 * Same closure + freeze shape as the other status-only stores (`FilamentStore`):
 * a single `loaded` bit behind a getter, one mutation seam (`setLoaded`), the
 * whole object frozen.
 *
 * Flow is a singleton overlay layer (see
 * `docs/superpowers/conventions/singleton-overlay-layers.md`): its `enabled`
 * gate and all look/motion tunables live in `settings.flow`, not on this store.
 * This store therefore carries no user state — only the load-status bit the
 * asset slot flips on commit.
 */
export function createFlowFieldStore(): FlowFieldStore {
  let loaded = false;

  return Object.freeze({
    get loaded(): boolean {
      return loaded;
    },
    setLoaded(): void {
      loaded = true;
    },
  });
}
