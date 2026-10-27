/**
 * FOCUS_MOTIONS — one row per focus-move style, keyed by `motion.style`. Read
 * only through `focusMotionRowOf`, so a new style is a new row, never a new
 * branch at a call site. It lives in services, not `src/data/`, because its
 * rows build clips from services code.
 */

import type { FocusMotion } from '../../../@types/camera/FocusMotion';
import type { FocusMotionRow } from '../../../@types/camera/FocusMotionRow';
import { easedFocusClip } from './easedFocusClip';

export const FOCUS_MOTIONS: {
  [S in FocusMotion['style']]: FocusMotionRow<Extract<FocusMotion, { style: S }>>;
} = {
  eased: {
    clipOf: easedFocusClip,
    durationMsOf: (d) => d.motion.durationMs,
    easeOf: (d) => d.motion.ease,
  },
};
