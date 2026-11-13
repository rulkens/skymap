/**
 * asteroidNowAt — row k's distances and V as seen from Earth, the same H,G formula the dots run.
 * Δ takes the dots' floor, so a row that passes through Earth's position never reads V = −∞.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidCatalog } from '../../catalog/@types/AsteroidCatalog';
import type { AsteroidNow } from '../@types/AsteroidNow';
import { ASTEROID_FORMAT as F } from '../../../../data/asteroids/asteroidFormat';
import { ASTEROID_PHOTOMETRY } from '../../points/data/asteroidPhotometry';
import { asteroidAbsoluteMagnitude } from '../../catalog/utils/asteroidAbsoluteMagnitude';
import { asteroidApparentMagnitude } from '../../../../utils/photometry/asteroidApparentMagnitude';

export function asteroidNowAt(
  catalog: AsteroidCatalog,
  k: number,
  helioAu: Readonly<Vec3>,
  earthHelioAu: Readonly<Vec3>,
): AsteroidNow {
  const fromEarth: Vec3 = [
    helioAu[0] - earthHelioAu[0],
    helioAu[1] - earthHelioAu[1],
    helioAu[2] - earthHelioAu[2],
  ];
  const r = Math.hypot(...helioAu);
  const earthDistanceAu = Math.hypot(...fromEarth);
  const delta = Math.max(earthDistanceAu, ASTEROID_PHOTOMETRY.minDeltaAu);
  const h = asteroidAbsoluteMagnitude(catalog, k);
  const cosPhase =
    (helioAu[0] * fromEarth[0] + helioAu[1] * fromEarth[1] + helioAu[2] * fromEarth[2]) /
    (r * delta);
  return {
    sunDistanceAu: r,
    earthDistanceAu,
    magnitude:
      h === null
        ? null
        : asteroidApparentMagnitude(h, catalog.g[k]! / F.gScale - F.gOffset, r, delta, cosPhase),
  };
}
