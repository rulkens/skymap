import type { OrbitPlaneFrame } from '../../@types/scene/OrbitPlaneFrame';
import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';
import { normalize3 } from '../math/normalize3';

/**
 * hostEquatorialFrame — a host's equator as a frame: `normal` its pole, `xAxis`
 * its vernal equinox (RA zero), the node where its orbit plane ascends through
 * its equator. One rule for every host: Earth's equinox of date against the
 * ecliptic, Mars's against its own orbit — no Earth special case.
 */
export function hostEquatorialFrame(
  pole: Readonly<Vec3>,
  orbitPole: Readonly<Vec3>,
): OrbitPlaneFrame {
  const xAxis = normalize3(cross3(pole, orbitPole));
  return { xAxis, yAxis: cross3(pole, xAxis), normal: [pole[0], pole[1], pole[2]] };
}
