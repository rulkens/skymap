/**
 * EngineHandle — the public API surface returned by createEngine.
 *
 * Down to two members: `debug` (the DebugPanel's own reach — camera state,
 * asset slots, timing) and `destroy`. Every other imperative knob the shell
 * once reached through a sub-handle (`selection`, `sources`) is now either a
 * plain store dispatch or a published Layer fact, read via a selector.
 */

import type { EngineDebugHandle } from './handles/EngineDebugHandle';

export type EngineHandle = {
  debug: EngineDebugHandle;

  /** Stops the render loop, releases GPU resources, detaches listeners; call
   *  from React's `useEffect` cleanup so StrictMode's double-mount doesn't
   *  leave an orphaned RAF loop. */
  destroy: () => void;
};
