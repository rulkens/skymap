import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Eye-relative point where the sphere's silhouette is highest on screen.
 * `toCentre` = centre − eye. The tangent point is `R·k` back toward the eye
 * from the centre and `R·√(1−k²)` up, so the eye ray to it grazes the sphere.
 */
export function sphereSilhouetteTop(
  toCentre: Readonly<Vec3>,
  radius: number,
  screenUp: Readonly<Vec3>,
  out: Vec3,
): Vec3 {
  const d = Math.hypot(toCentre[0], toCentre[1], toCentre[2]);
  const ax = toCentre[0] / d;
  const ay = toCentre[1] / d;
  const az = toCentre[2] / d;
  const along = screenUp[0] * ax + screenUp[1] * ay + screenUp[2] * az;
  const ux = screenUp[0] - ax * along;
  const uy = screenUp[1] - ay * along;
  const uz = screenUp[2] - az * along;
  const un = Math.hypot(ux, uy, uz);
  const k = Math.min(radius / d, 1);
  const back = radius * k;
  const up = (radius * Math.sqrt(1 - k * k)) / un;
  out[0] = toCentre[0] - ax * back + ux * up;
  out[1] = toCentre[1] - ay * back + uy * up;
  out[2] = toCentre[2] - az * back + uz * up;
  return out;
}
