/**
 * The camera band's shipped defaults and slider ranges — pure data, the only
 * file that names a number. Every consumer takes a `CameraTuning` VALUE (the
 * store's `camera.tuning`, seeded from here); nothing reads this record live.
 */

import type { CameraTuning } from '../../@types/camera/CameraTuning';

/** Ruling 19, re-tuned 2026-09-10: 0.45 R ≈ 2,870 km over Earth. */
export const DEFAULT_CAMERA_TUNING = {
  engageHR: 0.45,
  disengageHR: 0.9,
  tiltFullHR: 0.06,
  tiltZeroHR: 0.6,
  blendSpace: 'log',
  northUp: true,
} as const satisfies CameraTuning;

/** Slider ranges + the hysteresis-window floor both edge pairs keep. */
export const CAMERA_TUNING_LIMITS = {
  engageMin: 0.1,
  engageMax: 3.0,
  disengageMin: 0.2,
  disengageMax: 6.0,
  tiltFullMin: 0.01,
  tiltFullMax: 3.0,
  tiltZeroMin: 0.05,
  tiltZeroMax: 6.0,
  minRatio: 1.1,
} as const;

/** The only cap on the remembered tilt: π = zenith, altitude-free (Cesium's
 * `maximumPitch`). Not tunable — it never had a slider. */
export const MAX_REMEMBERED_TILT_RAD = Math.PI;
