/**
 * buildHalo — a faint, extended envelope of old stars around ellipticals and
 * lenticulars (`budget.haloCount` is 0 for every other category, so the loop
 * is a natural no-op there — no explicit category guard needed). Ported from
 * galaxy-model.js:439-447.
 *
 * Heavy-tailed radial profile out to `outerRadius * 2.4`, rejection-resampled
 * (`i--; continue`) like the bulge's rejection so `budget.haloCount` records
 * are always written exactly. `flattening` squashes the sphere into the same
 * thin spheroid the bulge uses; brightness fades exponentially with
 * distance, tightened by `bulgeConcentration`.
 */
import { tempColor } from '../tempColor';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function buildHalo(ctx: GalaxyBuildContext): void {
  const {
    rand,
    outerRadius,
    flattening,
    bulgeConcentration,
    starSize,
    randomLuminosity,
    addStar,
    budget,
  } = ctx;
  const rgb: Vec3 = [0, 0, 0];

  for (let i = 0; i < budget.haloCount; i++) {
    const dist = outerRadius * 0.3 * Math.pow(-Math.log(1 - rand() * 0.998), 1.35);
    if (dist > outerRadius * 2.4) {
      i--;
      continue;
    }
    const cosLat = 2 * rand() - 1;
    const sinLat = Math.sqrt(1 - cosLat * cosLat);
    const lon = 2 * Math.PI * rand();
    const x = dist * sinLat * Math.cos(lon);
    const z = dist * sinLat * Math.sin(lon);
    const y = dist * cosLat * flattening;
    const haloFalloff = Math.exp(-dist / (outerRadius * (0.85 - 0.45 * bulgeConcentration)));
    tempColor(0.3 + 0.12 * rand(), rgb);
    addStar(
      x,
      y,
      z,
      rgb[0],
      rgb[1],
      rgb[2],
      starSize * 0.7,
      randomLuminosity() * 0.5 * haloFalloff,
    );
  }
}
