/** The body arm's gesture boundary on its memory: the pointer edge is the ONLY
 * thing that latches or drops a surface gesture, so this is its one spelling. */

import type { SurfaceMemory } from '../../@types/camera/SurfaceMemory';

export function surfaceGestureEdge(prev: SurfaceMemory, down: boolean): SurfaceMemory {
  return { ...prev, gesture: down ? 'down' : null };
}
