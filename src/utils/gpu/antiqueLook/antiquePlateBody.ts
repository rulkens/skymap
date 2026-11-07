/**
 * antiquePlateBody — one globe as the plate casts it: eye-relative in its own
 * radii (from f64 Mpc, so no cancellation reaches the GPU), world axes, with
 * its Sun, its ring (the host's pole is the ring normal) and its apparent
 * radius in print units. Null when the eye is within ANTIQUE_PLATE_RELIEF_MARGIN
 * of its relief: a sphere cast near the ground draws a false horizon under the
 * real skyline, so a surface view keeps the plain path.
 */

import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { AntiquePlateBody } from '../../../@types/rendering/AntiquePlateBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { ANTIQUE_PLATE_RELIEF_MARGIN } from '../../../data/rendering/antiquePlateBodies';

export function antiquePlateBody(input: {
  readonly positionMpc: Readonly<Vec3>;
  /** Local → world; its third column is the pole. */
  readonly orientation: Readonly<Mat3>;
  /** The radius its sphere is drawn at. */
  readonly radiusM: number;
  /** Its highest peak's radius (`outerBoundRadiusM`). */
  readonly outerRadiusM: number;
  readonly land: boolean;
  /** Ring edges in km: C inner, B inner, Cassini mid, A outer, and the texture's outer edge. */
  readonly ringKm: readonly [number, number, number, number, number] | null;
  readonly eyeMpc: Readonly<Vec3>;
  readonly sunMpc: Readonly<Vec3>;
  /** Print units per radian at the view centre (focal length in units). */
  readonly unitsPerRad: number;
}): AntiquePlateBody | null {
  const { positionMpc: p, orientation: m, radiusM, eyeMpc: eye, sunMpc: sun, ringKm } = input;
  const toRadii = SCALE_UNITS.MPC_TO_M / radiusM;
  const centre: Vec3 = [
    (p[0] - eye[0]) * toRadii,
    (p[1] - eye[1]) * toRadii,
    (p[2] - eye[2]) * toRadii,
  ];
  const d = Math.hypot(...centre);
  if (d * radiusM < input.outerRadiusM * ANTIQUE_PLATE_RELIEF_MARGIN) return null;
  const toSun: Vec3 = [sun[0] - p[0], sun[1] - p[1], sun[2] - p[2]];
  const sunDistance = Math.hypot(...toSun);
  if (sunDistance === 0) return null;
  const kmToRadii = SCALE_UNITS.KM_TO_M / radiusM;
  return {
    centre,
    // tan(asin(1/d)) = 1/√(d²−1): the silhouette cone's half-angle, projected.
    radiusUnits: input.unitsPerRad / Math.sqrt(d * d - 1),
    sun: [toSun[0] / sunDistance, toSun[1] / sunDistance, toSun[2] / sunDistance],
    land: input.land,
    ring:
      ringKm === null
        ? null
        : {
            normal: [m[6], m[7], m[8]],
            lines: [
              ringKm[0] * kmToRadii,
              ringKm[1] * kmToRadii,
              ringKm[2] * kmToRadii,
              ringKm[3] * kmToRadii,
            ],
            outer: ringKm[4] * kmToRadii,
          },
  };
}
