import type { AntiqueBodyView } from '../../../src/layers/body/labels/@types/AntiqueBodyView';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const RADIUS_KM = 1737;
const CENTRE = [800, 450] as const;

const normal = (latDeg: number, lonDeg: number): Vec3 => {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
};
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The Moon seen from far out over latitude `eyeLatDeg` on the prime meridian, north up,
 * east to the right, `radiusPx` across: an orthographic stand-in for `antiqueBodyView`.
 */
export function orthographicMoonView(
  radiusPx: number,
  toSun: Vec3 = [1, 0, 0],
  eyeLatDeg = 0,
): AntiqueBodyView {
  const eye = normal(eyeLatDeg, 0);
  const up = normal(eyeLatDeg + 90, 0);
  return {
    project: (latDeg, lonDeg) => {
      const n = normal(latDeg, lonDeg);
      return [CENTRE[0] + radiusPx * n[1], CENTRE[1] - radiusPx * dot(n, up)];
    },
    facing: (latDeg, lonDeg) => dot(normal(latDeg, lonDeg), eye),
    sunCos: (latDeg, lonDeg) => dot(normal(latDeg, lonDeg), toSun),
    pxPerKm: () => radiusPx / RADIUS_KM,
    discCentrePx: [CENTRE[0], CENTRE[1]],
    discRadiusPx: radiusPx,
    radiusKm: RADIUS_KM,
    anchorMpc: () => [0, 0, 0],
  };
}

/** The Sun's direction lighting the meridian `lonDeg` square-on: its terminator 90° east of it. */
export const sunOverLon = (lonDeg: number): Vec3 => normal(0, lonDeg);
