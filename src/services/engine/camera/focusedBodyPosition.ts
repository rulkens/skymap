/**
 * focusedBodyPosition — the live world position of the currently-focused scene
 * body this frame, or null when the focus is not a body present in the snapshot.
 *
 * This is the SINGLE resolution of 'which point is the camera's pivot while a
 * body is focused'. Two callers share it, so the pivot is defined in exactly one
 * place rather than copied per driver:
 *
 *   - The `followBody` driver — its `isActive` predicate (a body focus present
 *     in the snapshot) and its `pose` target term both come from here.
 *   - The frame-loop pivot-pin (`applyFocusedBodyPivot`) — re-centres whichever
 *     OTHER orbit driver wins (orbitDrag while dragging, autoRotate while
 *     spinning, resting while idle) on the same live body position.
 *
 * The body keeps moving at the sim rate; resolving the pivot from the live
 * snapshot every frame is what lets the camera track it. `deriveBodyStates` is
 * memoised one-deep on `simDays`, so a same-instant call returns the cached Map
 * for free — no extra Kepler solve.
 */

import { deriveBodyStates } from '../frame/deriveBodyStates';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

export function focusedBodyPosition(focusRow: SelectionRow | null, simDays: number): Vec3 | null {
  if (focusRow === null || focusRow.type !== 'body') return null;
  return deriveBodyStates(simDays).get(focusRow.id)?.positionMpc ?? null;
}
