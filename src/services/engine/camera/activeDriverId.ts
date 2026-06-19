/**
 * activeDriverId — report which driver is winning this frame, without
 * re-resolving the pose.
 *
 * `runCameraDrivers` and `activeDriverId` both delegate to `pickWinner`, so
 * they are guaranteed to agree on the winning driver (invariant 1 of the
 * commit-on-edge ordering): the commit-on-edge path cannot key on a different
 * driver than the one that produced the pose. A caller that called
 * `runCameraDrivers(drivers, s, cam, clock, nowMs)` and then called this
 * function with the SAME `drivers` and `s` will always receive the same id as
 * the driver whose `pose` was called. There is no separate 'who won' bookkeeping
 * — one function, one scan, one answer.
 *
 * The function lives in its own file (one function per file per project
 * convention) rather than inlined in `runFrame` because the caller intent
 * ('what was the winning driver?') deserves a named home, and because naming it
 * makes the invariant expressible in comments and tests.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { RootState } from '../../../store/types';
import { pickWinner } from './cameraDrivers';

/**
 * Return the `id` of the highest-priority active driver in `drivers` for the
 * given store state `s`.
 *
 * Always returns a string: the always-active `resting` floor (priority 0)
 * guarantees that at least one driver is active. Calling this with an empty
 * `drivers` list returns `drivers[0].id` (the same defensive fallback
 * `pickWinner` uses).
 */
export function activeDriverId(drivers: readonly CameraDriver[], s: RootState): string {
  return pickWinner(drivers, s).id;
}
