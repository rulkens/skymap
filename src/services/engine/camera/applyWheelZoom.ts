/**
 * applyWheelZoom — route a discrete wheel-zoom factor to whichever owner
 * authors the camera distance this frame.
 *
 * Two distance owners, split by who wins the driver arbitration:
 *
 *   - followBody. While a scene body is focused, the followBody driver owns the
 *     pose distance and reads it from `clock.followDistanceTarget`. The resting
 *     driver (which renders `camera.base`) is NOT the winner, so committing a
 *     zoomed `base` would be invisible — followBody re-asserts its own distance
 *     target every frame and swallows the zoom. Instead we scale the follow's
 *     OWN distance target in place: the wheel edits the follow's distance
 *     directly (the same slot a post-drag recapture writes), and the driver
 *     eases to it. Returns null — nothing to commit into the store.
 *
 *   - everyone else (resting / autoRotate / tween …). `camera.base` IS the
 *     rendered distance, so return the zoomed `base` for the caller to commit.
 *
 * `prevActiveId` is the previous frame's winning driver id
 * (`state.cameraRuntime.prevActiveId.current`). The wheel event fires BETWEEN
 * frames, so last frame's winner is this frame's winner too — no driver change
 * can intervene between the event and the next produce. A null distance target
 * means the follow driver's `pose` has not run yet to seed it (the one-frame
 * window right after focus); fall through to the base commit, which is harmless
 * because the follow approach re-seeds the framing distance on its first produce.
 *
 * This keeps the follow driver's two distance sources un-braided: fresh focus
 * seeds the framing distance; any USER zoom writes the user's distance. The
 * drag path writes it via the recapture edge (a committed base.distance); this
 * function is the WHEEL half of 'any user zoom'.
 */

import { clampDistance } from '../../../utils/camera/clampDistance';
import { zoomedPose } from '../../../utils/camera/zoomedPose';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import type { CameraPose } from '../../../@types/camera/CameraPose';

export function applyWheelZoom(
  clock: CameraClock,
  prevActiveId: string,
  base: CameraPose,
  factor: number,
): CameraPose | null {
  if (prevActiveId === 'followBody' && clock.followDistanceTarget !== null) {
    clock.followDistanceTarget = clampDistance(clock.followDistanceTarget * factor);
    return null;
  }
  return zoomedPose(base, factor);
}
