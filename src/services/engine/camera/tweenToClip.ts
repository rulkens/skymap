/**
 * tweenToClip — a `CameraTweenDescriptor` as `ClipData`, so a focus tween runs
 * through the ONE camera-evaluation path, `evaluateClip`.
 *
 * `target` + `distance` move together as a single `glide` — a zoom/pan geodesic,
 * so perceived velocity stays constant across a scale change. `yaw`/`pitch` stay
 * independent scalar tweens beside it (spec §5.2): van Wijk & Nuij does not model
 * orientation, and angles are scale-free, so they never had the 1/d problem.
 *
 * Memoised per descriptor identity — a descriptor is a stable store reference for
 * its tween's lifetime, so `evaluateClip`'s compile cache (also keyed on
 * `ClipData` identity) reuses the compiled tracks for every frame of the flight.
 */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { ClipData } from '../../../@types/animation/ClipData';
import { tween, glide, all } from '../animation/effectHelpers';

/** Memoises the ClipData for each descriptor reference. */
const cache = new WeakMap<CameraTweenDescriptor, ClipData>();

/**
 * @param d A `CameraTweenDescriptor` stored in the Redux camera slice.
 * @returns  A `ClipData` whose `evaluateClip(data, elapsedMs / 1000, _, fovYRad)`
 *           produces the focus-tween pose at `elapsedMs` milliseconds elapsed.
 */
export function tweenToClip(d: CameraTweenDescriptor): ClipData {
  const cached = cache.get(d);
  if (cached !== undefined) return cached;

  const durationSec = d.durationMs / 1000;

  const data: ClipData = {
    start: d.from,
    timeline: [
      all([
        // `over` explicitly: the producer already derived this duration from the
        // same geodesic, so letting the builder re-derive it would risk two
        // answers for one move.
        // `rho` explicitly too: the producer measured `durationSec` on the
        // geodesic THIS ρ draws, so compiling the path at any other ρ would
        // pace a different curve than the one that was timed.
        glide(
          { target: d.to.target, distance: d.to.distance },
          { over: durationSec, rho: d.rho, ease: d.easing },
        ),
        tween('yaw', { to: d.to.yaw, over: durationSec, ease: d.easing }),
        tween('pitch', { to: d.to.pitch, over: durationSec, ease: d.easing }),
      ]),
    ],
  };

  cache.set(d, data);
  return data;
}
