/**
 * tweenToClip — converts a `CameraTweenDescriptor` to the equivalent `ClipData`.
 *
 * ### Why this exists
 *
 * There is ONE camera-evaluation path: `evaluateClip`.
 * A focus tween is the degenerate clip — one `set` segment per scalar channel
 * and one `setVec` for `target`, all with `ease:'easeOutCubic'` and
 * `space:'lin'` for `distance` (focus tweens interpolate distance linearly, not
 * in log space). The `cameraDrivers` tween row calls `evaluateClip` via this
 * helper.
 *
 * ### Memoisation by descriptor identity
 *
 * `CameraTweenDescriptor` objects are stored in the Redux store and remain the
 * same reference for the tween's lifetime (a new descriptor is written only
 * when a new tween starts). This helper caches one `ClipData` per descriptor
 * identity via a `WeakMap`. Two benefits:
 *
 *   1. `evaluateClip`'s compile cache (also a WeakMap on ClipData identity)
 *      reuses its compiled tracks for the tween's full duration — no re-compile
 *      on every frame.
 *   2. No allocation on steady-state frames (the GC cost is bounded to one
 *      `ClipData` + one `CompiledClip` per tween start).
 *
 * ### Distance space
 *
 * `dollyTo` / `tween('distance', ...)` defaults to `space:'log'` (the natural
 * space for camera zooms). Focus tweens use `lerp` — plain linear distance
 * interpolation. This helper
 * explicitly passes `space:'lin'` to override the default.
 */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { ClipData } from '../../../@types/animation/ClipData';
import { tween, moveTarget, all } from '../animation/effectHelpers';

/** Memoises the ClipData for each descriptor reference. */
const cache = new WeakMap<CameraTweenDescriptor, ClipData>();

/**
 * Return the `ClipData` equivalent of `d`. The result is memoised by reference
 * identity, so repeated calls with the same descriptor object return the same
 * `ClipData` — enabling `evaluateClip`'s compile cache to reuse its compiled
 * tracks across frames.
 *
 * @param d A `CameraTweenDescriptor` stored in the Redux camera slice.
 * @returns  A `ClipData` whose `evaluateClip(data, elapsedMs / 1000)` produces
 *           the focus-tween pose at `elapsedMs` milliseconds elapsed.
 */
export function tweenToClip(d: CameraTweenDescriptor): ClipData {
  const cached = cache.get(d);
  if (cached !== undefined) return cached;

  const durationSec = d.durationMs / 1000;

  // Build a one-segment clip: all four channels tweened with easeOutCubic
  // from `d.from` (the ClipData start pose) to the matching `d.to` field.
  // Distance uses space:'lin' so the interpolation is byte-for-byte
  // identical to the old lerp(from, to, easeOutCubic(t)) path.
  const data: ClipData = {
    start: d.from,
    timeline: [
      all([
        tween('distance', {
          to: d.to.distance,
          over: durationSec,
          ease: 'easeOutCubic',
          space: 'lin',
        }),
        tween('yaw', { to: d.to.yaw, over: durationSec, ease: 'easeOutCubic' }),
        tween('pitch', { to: d.to.pitch, over: durationSec, ease: 'easeOutCubic' }),
        moveTarget(d.to.target, durationSec, 'easeOutCubic'),
      ]),
    ],
  };

  cache.set(d, data);
  return data;
}
