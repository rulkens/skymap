/**
 * buildBulge — old, warm stars in a concentrated (triaxial) spheroid. First
 * population builder to draw from `ctx.rand`/`ctx.randNormal` in the spike's
 * main stream (galaxy-model.js:196-223) — the ordering contract documented
 * on `GalaxyBuildContext` and enforced by the Task 10 orchestrator depends on
 * nothing drawing from those streams before this runs.
 *
 * Two radial profiles, picked by `ctx.category`: an elliptical galaxy is
 * "all bulge" with a heavy-tailed profile out to `outerRadius * 1.6`; a
 * disk-galaxy bulge is smaller and blends into the disk, capped at
 * `bulgeRadius * 2.8`. Both use `i--; continue` on an out-of-range draw —
 * a *resample*, not a skip, so `ctx.budget.bulgeCount` records are always
 * written exactly (contrast `buildDisk`'s barred-fade skip, which shrinks
 * the record count on purpose).
 */
import { tempColor } from '../tempColor';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function buildBulge(ctx: GalaxyBuildContext): void {
  const {
    rand,
    category,
    outerRadius,
    bulgeRadius,
    bulgeConcentration,
    bulgeAxisX,
    bulgeAxisY,
    bulgeAxisZ,
    cosBulge,
    sinBulge,
    starSize,
    randomLuminosity,
    addStar,
    budget,
  } = ctx;
  const rgb: Vec3 = [0, 0, 0];

  for (let i = 0; i < budget.bulgeCount; i++) {
    let dist: number;
    let brightnessFalloff = 1;
    if (category === 'elliptical') {
      // Heavy-tailed radial profile plus a brightness falloff so the
      // envelope fades out with no hard edge.
      dist = outerRadius * 0.16 * Math.pow(-Math.log(1 - rand() * 0.997), 1.3);
      if (dist > outerRadius * 1.6) {
        i--;
        continue;
      }
      brightnessFalloff = Math.exp(-dist / (outerRadius * (0.62 - 0.4 * bulgeConcentration)));
    } else {
      dist = bulgeRadius * 0.55 * Math.pow(-Math.log(1 - rand() * 0.997), 1.25);
      if (dist > bulgeRadius * 2.8) {
        i--;
        continue;
      }
      brightnessFalloff = Math.exp(-dist / (bulgeRadius * (1.5 - 1.0 * bulgeConcentration)));
    }
    // Uniform direction on a sphere, then squash/rotate into a triaxial ellipsoid.
    const cosLat = 2 * rand() - 1;
    const sinLat = Math.sqrt(1 - cosLat * cosLat);
    const lon = 2 * Math.PI * rand();
    const localX = dist * sinLat * Math.cos(lon) * bulgeAxisX;
    const localY = dist * cosLat * bulgeAxisY;
    const localZ = dist * sinLat * Math.sin(lon) * bulgeAxisZ;
    const x = localX * cosBulge - localZ * sinBulge;
    const z = localX * sinBulge + localZ * cosBulge;
    const y = localY;
    tempColor(0.27 + 0.15 * rand(), rgb); // warm / old population
    addStar(
      x,
      y,
      z,
      rgb[0],
      rgb[1],
      rgb[2],
      starSize * (0.8 + 0.5 * rand()),
      randomLuminosity() * 0.85 * brightnessFalloff,
    );
  }
}
