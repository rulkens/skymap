/**
 * anchoredZoomStep — one stateless zoom tick on the body arm (spec §6b):
 * `eye′ = anchor + factor · (eye − anchor)`, no accumulator anywhere (FW-B).
 *
 * The anchor is the cursor's body-local pick in BOTH wheel directions (ruling
 * #7); a miss falls back to the surface point under the eye, keeping the step
 * an altitude scale. With `eye·Â ≥ |A|` — which the floor below guarantees —
 * `eye′·Â = |A| + f·(eye·Â − |A|) ≥ |A|` for all `f ≥ 0`, so no tangent-plane
 * overshoot guard is needed. `factor` is centre-measured, never `|eye − A|`.
 * The floor is `flooredBodyPose`'s, so a notch serving a focus lifts the eye
 * about that point rather than radially off its sightline.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { GroundRadiusLookup } from '../../@types/camera/GroundRadiusLookup';
import type { Vec3 } from '../../@types/math/Vec3';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { flooredBodyPose } from './flooredBodyPose';
import { spentZoomFactor } from './spentZoomFactor';

export function anchoredZoomStep(
  pose: BodyFixedPose,
  factor: number,
  cursorAnchorM: Readonly<Vec3> | null,
  bodyRadiusM: number,
  standoffRadii: number,
  groundRadiusAtM: GroundRadiusLookup,
  /** The point the notch SERVES (a focused rover), which the floor turns about. */
  floorPivotM: Readonly<Vec3> | null,
): BodyFixedPose {
  const clampedFactor = spentZoomFactor(factor);
  const { anchorLocalM } = pose;
  const eyeM = bodyFixedEyeM(pose);

  // The miss fallback is the eye's own nadir footprint, not the body centre
  // (user ruling §12-R4): it lies on the eye's radial, so the step scales
  // ALTITUDE rather than geocentric range, which is what makes one notch out
  // undo one notch in near the ground. An eye exactly at the centre has no
  // radial, so the centre is the only answer there.
  const eyeMagM = Math.hypot(eyeM[0], eyeM[1], eyeM[2]);
  const anchorM: Readonly<Vec3> =
    cursorAnchorM !== null
      ? cursorAnchorM
      : eyeMagM === 0
        ? [0, 0, 0]
        : [
            (eyeM[0] / eyeMagM) * bodyRadiusM,
            (eyeM[1] / eyeMagM) * bodyRadiusM,
            (eyeM[2] / eyeMagM) * bodyRadiusM,
          ];

  const steppedM: Vec3 = [
    anchorM[0] + clampedFactor * (eyeM[0] - anchorM[0]),
    anchorM[1] + clampedFactor * (eyeM[1] - anchorM[1]),
    anchorM[2] + clampedFactor * (eyeM[2] - anchorM[2]),
  ];

  return flooredBodyPose(
    {
      ...pose,
      eyeRelAnchorM: [
        steppedM[0] - anchorLocalM[0],
        steppedM[1] - anchorLocalM[1],
        steppedM[2] - anchorLocalM[2],
      ],
    },
    groundRadiusAtM,
    standoffRadii,
    floorPivotM,
  );
}
