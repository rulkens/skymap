/**
 * EngineHandle — the public API surface returned by createEngine.
 *
 * Down to two members: `debug` (the DebugPanel's own reach — camera state,
 * asset slots, timing) and `destroy`. Every other imperative knob the shell
 * once reached through a sub-handle (`selection`, `sources`) is now either a
 * plain store dispatch or a published Layer fact, read via a selector.
 */

import type { EngineDebugHandle } from './handles/EngineDebugHandle';

/**
 * Handle returned by `createEngine`. Lets the React layer drive the
 * engine without knowing its internal structure.
 */
export type EngineHandle = {
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
