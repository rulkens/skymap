/**
 * MISSION_TRAIL_STYLE — per-craft trail tint (linear HDR, channels ≲ 0.5 like
 * the orbit trails in `palette.ts`) and full stroke width in px. V1 pale gold and
 * V2 copper, so the two trails separate on screen where they run close.
 * Width is twice the orbit trails' `STROKE_PX` half-width (2.5).
 */

import type { Vec3 } from '../../@types/math/Vec3';

export const MISSION_TRAIL_WIDTH_PX = 5;

// Chord sag budget of the trail polyline against the Hermite curve.
export const MISSION_TRAIL_MAX_SAG_KM = 10;

export const MISSION_TRAIL_COLOR: Readonly<Record<string, Vec3>> = {
  voyager1: [0.5, 0.43, 0.25],
  voyager2: [0.5, 0.26, 0.12],
};
