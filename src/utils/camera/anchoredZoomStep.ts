/**
 * anchoredZoomStep — one stateless zoom tick on the body arm (spec §6b):
 * `eye′ = anchor + factor · (eye − anchor)`, no accumulator anywhere (FW-B).
 *
 * The anchor is the cursor's body-local pick only while *closing* on it
 * (`factor < 1` — a closing-distance gate, never an altitude one) with a hit;
 * zoom-out and any miss fall back to the body centre, so the cursor can never
 * become a repelling pivot the camera drifts toward over many notches
 * (FW-H). Anchoring on a point that lies on the visible sphere (which is all
 * a real cursor pick ever is) keeps `eye′` on the same side of that point's
 * tangent plane as `eye` for any `factor ∈ (0, 1]` — a convex combination of
 * two points already on-or-outside the plane can't cross it — so no extra
 * overshoot guard is needed here; a caller feeding a degenerate anchor is
 * still reported honestly through the returned pose, uncorrected.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { surfaceFloorM } from './surfaceFloorM';

// Per-notch factor bounds — feel-open until Task 22 (input-mapping tuning).
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 2.0;

const CENTRE: Vec3 = [0, 0, 0];

export function anchoredZoomStep(
  pose: BodyFixedPose,
  factor: number,
  cursorAnchorM: Vec3 | null,
  bodyRadiusM: number,
): BodyFixedPose {
  const clampedFactor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
  const { anchorLocalM, eyeRelAnchorM } = pose;
  const eyeM: Vec3 = [
    anchorLocalM[0] + eyeRelAnchorM[0],
    anchorLocalM[1] + eyeRelAnchorM[1],
    anchorLocalM[2] + eyeRelAnchorM[2],
  ];

  const approaching = clampedFactor < 1;
  const anchorM = approaching && cursorAnchorM !== null ? cursorAnchorM : CENTRE;

  const steppedM: Vec3 = [
    anchorM[0] + clampedFactor * (eyeM[0] - anchorM[0]),
    anchorM[1] + clampedFactor * (eyeM[1] - anchorM[1]),
    anchorM[2] + clampedFactor * (eyeM[2] - anchorM[2]),
  ];

  const floorM = surfaceFloorM(bodyRadiusM);
  const steppedMagM = Math.hypot(steppedM[0], steppedM[1], steppedM[2]);
  const floorScale = steppedMagM < floorM ? floorM / steppedMagM : 1;

  const eyeNewM: Vec3 = [
    steppedM[0] * floorScale,
    steppedM[1] * floorScale,
    steppedM[2] * floorScale,
  ];

  return {
    ...pose,
    eyeRelAnchorM: [
      eyeNewM[0] - anchorLocalM[0],
      eyeNewM[1] - anchorLocalM[1],
      eyeNewM[2] - anchorLocalM[2],
    ],
  };
}
