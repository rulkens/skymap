import type { HeightPyramid } from '../@types/HeightPyramid';
import { HORIZON_ANGLE_MAP } from '../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import { heightLatticeStepDeg } from '../../../utils/textures/heightLatticeStepDeg';
import {
  HORIZON_MARCH_COARSEST_LEVEL,
  HORIZON_MARCH_MAX_ARC_RAD,
  HORIZON_MARCH_STEP_DIVISOR,
} from '../data/horizonMarch';
import { curvatureDropM } from './curvatureDropM';

const DEG = Math.PI / 180;
const FLOOR_TAN = Math.tan(HORIZON_ANGLE_MAP.minDeg * DEG);

/**
 * marchHorizonSector — the horizon elevation in degrees, never under the map's floor, seen
 * from the ground at a level-`z` post along `azimuthRad`, clockwise from local north.
 * Pole convention, which the shader's lookup must copy: the frame comes from the post's own
 * longitude λ and latitude φ, east = (−sin λ, cos λ, 0) and north = (−sin φ cos λ,
 * −sin φ sin λ, cos φ), with no special case. At φ = ±90° that is the limit along meridian λ:
 * at the north pole, north points down meridian λ + 180°; at the south pole, up meridian λ.
 */
export function marchHorizonSector(
  pyramid: HeightPyramid,
  z: number,
  lonRad: number,
  latRad: number,
  azimuthRad: number,
  ceilingM: number,
): number {
  const { radiusM } = pyramid;
  const postM = heightLatticeStepDeg(z) * DEG * radiusM;
  const originM = pyramid.heightAt(z, lonRad, latRad);
  if (!Number.isFinite(originM)) {
    throw new Error(
      `marchHorizonSector: height ${originM} at z${z} post (${lonRad / DEG}°, ${latRad / DEG}°)`,
    );
  }
  const [sinLon, cosLon] = [Math.sin(lonRad), Math.cos(lonRad)];
  const [sinLat, cosLat] = [Math.sin(latRad), Math.cos(latRad)];
  const [sinAz, cosAz] = [Math.sin(azimuthRad), Math.cos(azimuthRad)];
  const up = [cosLat * cosLon, cosLat * sinLon, sinLat] as const;
  const dir = [
    -cosAz * sinLat * cosLon - sinAz * sinLon,
    -cosAz * sinLat * sinLon + sinAz * cosLon,
    cosAz * cosLat,
  ] as const;

  let best = FLOOR_TAN;
  const maxArcM = HORIZON_MARCH_MAX_ARC_RAD * radiusM;
  for (let d = postM; d <= maxArcM; ) {
    const dropM = curvatureDropM(d, radiusM);
    // Nothing farther can beat `best`: (ceiling − origin − drop)/d only falls with d.
    if ((ceilingM - originM - dropM) / d < best) break;
    const step = Math.max(postM, d / HORIZON_MARCH_STEP_DIVISOR);
    const level = Math.max(HORIZON_MARCH_COARSEST_LEVEL, z - Math.floor(Math.log2(step / postM)));
    const [cosArc, sinArc] = [Math.cos(d / radiusM), Math.sin(d / radiusM)];
    const px = cosArc * up[0] + sinArc * dir[0];
    const py = cosArc * up[1] + sinArc * dir[1];
    const pz = Math.min(1, Math.max(-1, cosArc * up[2] + sinArc * dir[2]));
    const tan = (pyramid.heightAt(level, Math.atan2(py, px), Math.asin(pz)) - originM - dropM) / d;
    if (tan > best) best = tan;
    d += step;
  }
  return Math.atan(best) / DEG;
}
