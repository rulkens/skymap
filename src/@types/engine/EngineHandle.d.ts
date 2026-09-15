/**
 * EngineHandle — the public API surface returned by createEngine.
 *
 * A thin cluster of named sub-handles plus one root-level affordance
 * (`destroy`). Every imperative knob lives on a topical sub-handle so the
 * React layer can subscribe to just the namespace it cares about; a flat
 * ~50-method root would say nothing about which methods belong together.
 * `camera` (dev `logState`, no reader — Findings) and the root `assetSlots`
 * (moved under `debug`, Task 10) are gone.
 */

import type { EngineSelectionHandle } from './handles/EngineSelectionHandle';
import type { EngineSourcesHandle } from './handles/EngineSourcesHandle';
import type { EngineDebugHandle } from './handles/EngineDebugHandle';

/**
 * Handle returned by `createEngine`. Lets the React layer drive the
 * engine without knowing its internal structure.
 */
export type EngineHandle = {
  // ── Sub-handles ───────────────────────────────────────────────────────────
  //
  // Each cluster's public surface lives in its own type alias so the
  // React shell can subscribe to just the namespace it cares about.
  selection: EngineSelectionHandle;
  sources: EngineSourcesHandle;
  debug: EngineDebugHandle;

  /**
   * Stop the render loop, release GPU resources, and detach all event
   * listeners.  Lives at the root rather than a sub-handle because
   * destruction is a session-scoped operation, not a cluster knob.
   *
   * Call this from React's `useEffect` cleanup so that hot-reload and
   * StrictMode double-mounts don't leave orphaned RAF loops or GPU objects.
   */
  destroy: () => void;
};
