/** The body arm's gesture boundary on its memory: the pointer edge is the ONLY
 * thing that latches or drops a surface gesture, so this is its one spelling. */

import type { SurfaceGestureMemory } from '../../@types/camera/SurfaceGestureMemory';

export function surfaceGestureEdge(down: boolean): SurfaceGestureMemory {
  return { gesture: down ? 'down' : null };
}
