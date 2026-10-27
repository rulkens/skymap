/**
 * FOCUS_MOTIONS — one row per focus-move style, keyed by `motion.style`. Read
 * only through `focusMotionRowOf`, so a new style is a new row, never a new
 * branch at a call site. It lives in services, not `src/data/`, because its
 * rows build clips from services code.
 */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { FocusMotion } from '../../../@types/camera/FocusMotion';
import type { FocusMotionRow } from '../../../@types/camera/FocusMotionRow';
import type { FocusMoveStyle } from '../../../@types/camera/FocusMoveStyle';
import { easedFocusClip } from './easedFocusClip';
import { all, geodesic, tween } from '../animation/effectHelpers';
import { geodesicPath } from '../../../utils/camera/geodesicPath';

// The setting's styles and the plan's styles are one list: a style added to
// either alone fails to compile here.
const STYLES_AGREE: [FocusMoveStyle] extends [FocusMotion['style']]
  ? [FocusMotion['style']] extends [FocusMoveStyle]
    ? true
    : false
  : false = true;

function geodesicDurationMs(
  d: CameraTweenDescriptor & { motion: Extract<FocusMotion, { style: 'geodesic' }> },
): number {
  return geodesicPath(d.from, d.to, d.motion.fovYRad, d.motion.tuning).durationMs;
}

export const FOCUS_MOTIONS: {
  [S in FocusMotion['style']]: FocusMotionRow<Extract<FocusMotion, { style: S }>>;
} = {
  eased: {
    clipOf: easedFocusClip,
    durationMsOf: (d) => d.motion.durationMs,
    easeOf: (d) => d.motion.ease,
  },
  geodesic: {
    // `over` is passed explicitly so the clip and the tween's end check are
    // sized by the one number `durationMsOf` returns.
    clipOf: (d) => {
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
    },
    durationMsOf: geodesicDurationMs,
    easeOf: (d) => d.motion.tuning.ease,
  },
};
