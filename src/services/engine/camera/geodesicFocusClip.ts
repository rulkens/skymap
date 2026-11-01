/**
 * geodesicFocusClip — the Geodesic focus move as `ClipData`: one `geodesic`
 * effect over target and distance, `all`-ed with yaw, pitch and roll tweens
 * over the same window and ease. `over` is passed explicitly so the clip and
 * the tween's end check are sized by the one number `geodesicDurationMs` returns.
 * Memoisation lives one level up, in `focusMoveClip`.
 */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { FocusMotion } from '../../../@types/camera/FocusMotion';
import type { ClipData } from '../../../@types/animation/ClipData';
import { all, geodesic, tween } from '../animation/effectHelpers';
import { geodesicDurationMs } from './geodesicDurationMs';

export function geodesicFocusClip(
  d: CameraTweenDescriptor & { motion: Extract<FocusMotion, { style: 'geodesic' }> },
): ClipData {
  const over = geodesicDurationMs(d) / 1000;
  const ease = d.motion.tuning.ease;
  return {
    start: d.from,
    timeline: [
      all([
        geodesic(d.to, d.motion.tuning, d.motion.fovYRad, over),
        tween('yaw', { to: d.to.yaw, over, ease }),
        tween('pitch', { to: d.to.pitch, over, ease }),
        tween('roll', { to: d.to.roll ?? 0, over, ease }),
      ]),
    ],
  };
}
