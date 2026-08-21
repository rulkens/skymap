/**
 * applyWheelZoom — route an at-rest zoom tick to whichever owner authors the
 * camera distance this frame (mid-gesture the drag register owns it, and the
 * caller applies the tick there instead).
 *
 * Three distance owners, split by who wins the driver arbitration:
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
 *   - autoRotate. The auto-rotate driver renders `spinAutoRotate(base, rate,
 *     elapsed)` — yaw advances from a FROZEN base by the cumulative elapsed the
 *     clock accumulates. `camera.base` IS the rendered distance, so a zoom must
 *     commit a new base. But committing the raw zoomed `base` installs a fresh
 *     base reference with the OLD (un-spun) yaw, and `autoRotateElapsed` resets
 *     its start on any base-identity change — so the rendered yaw would snap
 *     from `base.yaw + spin` back to `base.yaw`: a visible pop on every wheel
 *     tick. We fold the accumulated spin into the committed pose instead: zoom
 *     the ALREADY-spun pose, so the elapsed reset lands on a base that already
 *     carries the spin and the spin continues seamlessly from there.
 *     `autoRotateElapsed` here is an idempotent READ — the driver already called
 *     it this frame with the same (active, base) refs, so re-reading it does not
 *     reset the start. Passing the REAL active bit matters: if auto-rotate was
 *     switched off between frames, elapsed reads 0 and this branch degrades to
 *     the plain zoomed base.
 *
 *   - everyone else (resting / tween …). `camera.base` IS the rendered
 *     distance, so return the zoomed `base` for the caller to commit.
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
 *
 * `step` is the tick already resolved against the camera on screen
 * (`cursorZoomStep`): a distance SCALE plus a world-space lateral pivot shift.
 * Only the follow arm drops the lateral — its slot is a scalar distance, and
 * following implies a pivot-pinned body, whose lateral the caller has already
 * routed into `clock.followPanOffset` (the only lateral channel the pin does
 * not erase). No arm re-floors the distance at the body's surface: `step` was
 * already floored in eye currency where it was computed — see `zoomedPose`.
 */

import { autoRotateElapsed } from './cameraClock';
import { spinAutoRotate } from './spinAutoRotate';
import { clampDistance } from '../../../utils/camera/clampDistance';
import { zoomedPose } from '../../../utils/camera/zoomedPose';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { ZoomStep } from '../../../@types/camera/ZoomStep';

export function applyWheelZoom(
  clock: CameraClock,
  prevActiveId: string,
  base: CameraPose,
  step: ZoomStep,
  autoRotate: { active: boolean; rate: number },
  nowMs: number,
): CameraPose | null {
  if (prevActiveId === 'followBody' && clock.followDistanceTarget !== null) {
    clock.followDistanceTarget = clampDistance(clock.followDistanceTarget * step.distanceScale);
    return null;
  }
  if (prevActiveId === 'autoRotate') {
    const elapsed = autoRotateElapsed(clock, autoRotate.active, base, nowMs);
    return zoomedPose(spinAutoRotate(base, autoRotate.rate, elapsed), step);
  }
  return zoomedPose(base, step);
}
