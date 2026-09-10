/**
 * The one bounded orientation decay both arms' settles read (R1, ruling 8):
 * `clamp(residual·(1 − e^(−perLogZoom·u)), ±capRadPerLogZoom·u)`, with `u` the log-zoom
 * the notch is ALLOWED to spend (`spentZoomFactor`) on the body arm; the world arm spends
 * its notch raw (`frameAlignedRoll`).
 */

import { WHEEL_ZOOM_K } from '../../services/engine/subsystems/inputAggregator';

const NOTCH_LOG_ZOOM = 100 * WHEEL_ZOOM_K;

export const ORIENT_DECAY = {
  perLogZoom: -Math.log(0.75) / NOTCH_LOG_ZOOM,
  capRadPerLogZoom: 0.1 / NOTCH_LOG_ZOOM,
  /** The calibration notch: the log-zoom one deltaY-100 wheel step carries. */
  notchLogZoom: NOTCH_LOG_ZOOM,
  /** A drag runs per STEP, not per log-zoom, so its level settle has its own cap (rad). */
  dragLevelCapRad: 0.1,
  /** A reference move beyond this in ONE notch is unauthored, so a blend flip cannot whip. */
  rideBoundRad: 0.3,
} as const;
