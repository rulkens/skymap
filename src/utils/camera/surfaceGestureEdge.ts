/**
 * surfaceGestureEdge — the body arm's gesture boundary on its memory. The
 * pointer edge is the ONLY thing that latches or drops a surface gesture, so
 * `replayInput` and the gesture fixtures share this one spelling of it.
 */

import type { SurfaceMemory } from '../../@types/camera/SurfaceMemory';

export function surfaceGestureEdge(prev: SurfaceMemory, pointerDown: boolean): SurfaceMemory {
  return { ...prev, pointerDown, gesture: null };
}
