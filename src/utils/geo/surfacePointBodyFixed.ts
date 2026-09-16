/**
 * surfacePointBodyFixed — a lat/lon on a sphere, in the host's BODY-FIXED axes:
 * +Z the pole, +X the prime meridian, longitude EAST-positive (the IAU
 * convention `rotationFromIau` builds those axes in). The caller rotates the
 * result into world with the host's orientation.
 */

import { degToRad } from '../math/degToRad';
import type { Vec3 } from '../../@types/math/Vec3';

export function surfacePointBodyFixed(latDeg: number, lonDeg: number, radiusM: number): Vec3 {
  const lat = degToRad(latDeg);
  const lon = degToRad(lonDeg);
  const ring = radiusM * Math.cos(lat);
  return [ring * Math.cos(lon), ring * Math.sin(lon), radiusM * Math.sin(lat)];
}
