import type { Vec3 } from '../../../@types/math/Vec3';
import type { OrbitPlaneBasis } from '../@types/OrbitPlaneBasis';
import { cross3 } from '../../../utils/math/cross3';
import { normalize3 } from '../../../utils/math/normalize3';

const CELESTIAL_POLE: Vec3 = [0, 0, 1];

/**
 * The orbital plane of a host at `hostWorld`, tilted `inclinationDeg` to our
 * sky (90 = edge-on, so its planets transit). Inclination alone leaves the
 * plane free to spin about our line of sight; the node line is pinned to
 * celestial east by convention. Unmeasured counts as face-on.
 */
export function exoplanetOrbitPlaneBasis(
  hostWorld: Readonly<Vec3>,
  inclinationDeg: number | null,
): OrbitPlaneBasis {
  const away = normalize3(hostWorld);
  const east = normalize3(cross3(CELESTIAL_POLE, away));
  const north = cross3(away, east);
  const i = ((inclinationDeg ?? 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(i), Math.sin(i)];
  const normal: Vec3 = [
    c * away[0] + s * north[0],
    c * away[1] + s * north[1],
    c * away[2] + s * north[2],
  ];
  return { u: cross3(normal, east), v: east };
}
