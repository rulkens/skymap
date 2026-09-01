/**
 * anchoredZoomStep — one stateless zoom tick on the body arm (spec §6b):
 * `eye′ = anchor + factor · (eye − anchor)`, no accumulator anywhere (FW-B).
 *
 * The anchor is the cursor's body-local pick only while *closing* on it
 * (`factor < 1`) with a hit; zoom-out and any miss fall back to the body
 * centre, so the cursor can never become a repelling pivot (FW-H). For a
 * visible anchor, `eye′·n̂ = |A| + f·(eye·n̂ − |A|) ≥ |A|` for all `f ≥ 0`,
 * so no tangent-plane overshoot guard is needed. The caller derives
 * `factor` from the centre-measured range, never from `|eye − anchor|`.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { surfaceFloorM } from './surfaceFloorM';

// Per-notch factor bounds — feel-open until Task 22 (input-mapping tuning).
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 2.0;

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
  const anchorM: Vec3 = approaching && cursorAnchorM !== null ? cursorAnchorM : [0, 0, 0];

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
