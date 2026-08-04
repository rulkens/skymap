/**
 * liveBodyPosition — the live world position of the currently-focused scene
 * body this frame.
 *
 * This is the SINGLE resolution of 'the live world position of a selection row's
 * body this frame'. Three callers share it, so that lookup is defined in exactly
 * one place rather than copied per site:
 *
 *   - The `followBody` driver — its `pose` target term.
 *   - The frame-loop pivot-pin (`applyFocusedBodyPivot`) — re-centres whichever
 *     OTHER orbit driver wins (orbitDrag while dragging, autoRotate while
 *     spinning, resting while idle) on the same live body position.
 *   - The NEAR0 selection-ring layer — centres the halo on the SELECT row's live
 *     body position so the ring tracks the animated body, not its pick-time pose.
 *
 * This answers WHERE, never WHETHER: a null return means only that the snapshot
 * holds no position for the row, and callers that need 'does this body move'
 * ask `bodyMovesThisFrame` — the snapshot carries static anchors too, so
 * presence in it is not motion.
 *
 * The body keeps moving at the sim rate; resolving the position from the live
 * snapshot every frame is what lets the camera track it and the ring follow it.
 * `deriveBodyStates` is memoised one-deep on `simDays`, so a same-instant call
 * returns the cached Map for free — no extra Kepler solve.
 */

import { deriveBodyStates } from '../frame/deriveBodyStates';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

export function liveBodyPosition(focusRow: SelectionRow | null, simDays: number): Vec3 | null {
  if (focusRow === null || focusRow.type !== 'body') return null;
  return deriveBodyStates(simDays).get(focusRow.id)?.positionMpc ?? null;
}
