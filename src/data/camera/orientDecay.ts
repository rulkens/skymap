/**
 * The one bounded orientation decay both arms' settles read (R1, ruling 8),
 * spent per unit of log-zoom `u = |ln factor|`:
 * `clamp(residual·(1 − e^(−perLogZoom·u)), ±capRadPerLogZoom·u)`. Calibrated on
 * the deltaY-100 mouse notch (`u = 100 · WHEEL_ZOOM_K = 0.1` = `notchLogZoom`)
 * to the legacy per-step 25 % / 0.1 rad: `perLogZoom = −ln(0.75)/0.1`,
 * `capRadPerLogZoom = 0.1/0.1`. A reference move beyond `rideBoundRad` in ONE
 * notch is unauthored, so a blend flip cannot whip.
 */
export const ORIENT_DECAY = {
  perLogZoom: 2.8768207245178088,
  capRadPerLogZoom: 1,
  /** What a DRAG step spends: it carries no zoom, and its settle is out of the per-zoom scope. */
  notchLogZoom: 0.1,
  rideBoundRad: 0.3,
} as const;
