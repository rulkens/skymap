/**
 * easedFocusClip — the Eased focus move as `ClipData`: one `set` per scalar
 * channel and one `setVec` for `target`, all over `motion.durationMs` with
 * `motion.ease`. There is ONE camera-evaluation path (`evaluateClip`), and a
 * focus tween is its degenerate clip.
 *
 * Distance tweens in `space:'lin'`, overriding `tween('distance')`'s log
 * default: the focus move has always interpolated distance linearly.
 * Memoisation lives one level up, in `focusMoveClip`.
 */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { FocusMotion } from '../../../@types/camera/FocusMotion';
import type { ClipData } from '../../../@types/animation/ClipData';
import { tween, moveTarget, all } from '../animation/effectHelpers';

export function easedFocusClip(
  d: CameraTweenDescriptor & { motion: Extract<FocusMotion, { style: 'eased' }> },
): ClipData {
  const over = d.motion.durationMs / 1000;
  const ease = d.motion.ease;
  return {
    start: d.from,
    timeline: [
      all([
        tween('distance', { to: d.to.distance, over, ease, space: 'lin' }),
        tween('yaw', { to: d.to.yaw, over, ease }),
        tween('pitch', { to: d.to.pitch, over, ease }),
        // A heading-carrying `to` (flyToLonLat) must land with its roll.
        tween('roll', { to: d.to.roll ?? 0, over, ease }),
        moveTarget(d.to.target, over, ease),
      ]),
    ],
  };
}
