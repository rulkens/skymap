import type { AntiqueBodyView } from '../../../src/layers/body/labels/@types/AntiqueBodyView';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const RADIUS_KM = 1737;
const CENTRE = [800, 450] as const;

const normal = (latDeg: number, lonDeg: number): Vec3 => {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
};

/**
 * The Moon seen from far out along body-fixed +X (longitude 0 faces the eye), north up,
 * east to the right, `radiusPx` across: an orthographic stand-in for `antiqueBodyView`.
 */
export function orthographicMoonView(radiusPx: number, toSun: Vec3 = [1, 0, 0]): AntiqueBodyView {
  return {
    project: (latDeg, lonDeg) => {
      const n = normal(latDeg, lonDeg);
      return [CENTRE[0] + radiusPx * n[1], CENTRE[1] - radiusPx * n[2]];
    },
    facing: (latDeg, lonDeg) => normal(latDeg, lonDeg)[0],
    sunCos: (latDeg, lonDeg) => {
      const n = normal(latDeg, lonDeg);
      return n[0] * toSun[0] + n[1] * toSun[1] + n[2] * toSun[2];
    },
    pxPerKm: () => radiusPx / RADIUS_KM,
    discCentrePx: [CENTRE[0], CENTRE[1]],
    discRadiusPx: radiusPx,
    radiusKm: RADIUS_KM,
    anchorMpc: () => [0, 0, 0],
  };
}

/** The Sun's direction lighting the meridian `lonDeg` square-on: its terminator 90° east of it. */
export const sunOverLon = (lonDeg: number): Vec3 => normal(0, lonDeg);
