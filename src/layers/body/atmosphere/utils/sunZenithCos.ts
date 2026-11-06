import type { Vec3 } from '../../../../@types/math/Vec3';

/** sunZenithCos — cos of the Sun's zenith angle at the eye; 0 for an eye at the body's centre. */
export function sunZenithCos(camLocal: Readonly<Vec3>, sunLocal: Readonly<Vec3>): number {
  const radius = Math.hypot(camLocal[0], camLocal[1], camLocal[2]);
  return radius > 0
    ? (camLocal[0] * sunLocal[0] + camLocal[1] * sunLocal[1] + camLocal[2] * sunLocal[2]) / radius
    : 0;
}
