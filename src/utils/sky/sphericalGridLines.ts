import type { Vec3 } from '../../@types/math/Vec3';
import { meridianLine } from './meridianLine';
import { parallelLine } from './parallelLine';

/**
 * sphericalGridLines — a latitude/longitude grid as polylines of unit
 * directions in its own frame (+z pole, +x longitude zero): every parallel
 * strictly between the poles, then every meridian. The alt-az and equatorial
 * grids are this, turned into the world by their frame.
 */
export function sphericalGridLines(
  latStepDeg: number,
  lonStepDeg: number,
  maxStepDeg: number,
): Vec3[][] {
  const lines: Vec3[][] = [];
  for (let lat = -90 + latStepDeg; lat < 90; lat += latStepDeg)
    lines.push(parallelLine(lat, maxStepDeg));
  for (let lon = 0; lon < 360; lon += lonStepDeg) lines.push(meridianLine(lon, maxStepDeg));
  return lines;
}
