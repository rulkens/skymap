/**
 * buildDisk — the smooth inter-arm stellar background. Ported from
 * galaxy-model.js:259-280.
 *
 * Barred galaxies only draw `diskCount - floor(diskCount * 0.35)` background
 * stars — the rest of the budget already went to `buildBar` — and additionally
 * fade the disk in from the centre via a `(radius / (barLength*1.15))^2`
 * acceptance test against a fresh `rand()` draw: a rejected star is a plain
 * `continue` (*skip*, not a resample), so the barred disk's final record
 * count is legitimately below `diskCount` — this is the mirror image of the
 * bulge/bar's `i--` resamples, and conflating the two would silently pad the
 * barred disk back up to `diskCount` stars with no centre fade.
 *
 * Vertical scatter puffs up near the bulge (`0.6 + bulgeRadius / (radius +
 * bulgeRadius)`) and thins out in the far disk; colour warms with youth and
 * radius via `tempColor`.
 */
import { tempColor } from '../tempColor';
import type { BarGeometry } from '../../../@types/model/BarGeometry';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function buildDisk(ctx: GalaxyBuildContext, bar: BarGeometry): void {
  const {
    category,
    budget,
    rand,
    randNormal,
    sampleDiskRadius,
    applyLopsided,
    diskHeight,
    bulgeRadius,
    outerRadius,
    params,
    diskFalloff,
    starSize,
    randomLuminosity,
    addStar,
  } = ctx;
  const youngFraction = params.youngStars ?? 0.5;
  const rgb: Vec3 = [0, 0, 0];
  const diskBgStars =
    category === 'barred'
      ? budget.diskCount - Math.floor(budget.diskCount * 0.35)
      : budget.diskCount;

  for (let i = 0; i < diskBgStars; i++) {
    let radius = sampleDiskRadius();
    // Barred galaxies: fade the disk in from the centre (the bar fills that
    // region) rather than punching a hard hole around the bar.
    if (category === 'barred') {
      const t = radius / (bar.barLength * 1.15);
      if (rand() > t * t) continue;
    }
    const angle = 2 * Math.PI * rand();
    radius = applyLopsided(radius, angle);
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    // Thinner far out, puffier near the bulge.
    const y = randNormal() * diskHeight * (0.6 + bulgeRadius / (radius + bulgeRadius));
    // Outskirts are a little bluer (younger) than the centre.
    tempColor(0.34 + 0.3 * youngFraction * (radius / outerRadius) + 0.12 * rand(), rgb);
    addStar(
      x,
      y,
      z,
      rgb[0],
      rgb[1],
      rgb[2],
      starSize * (0.75 + 0.5 * rand()),
      randomLuminosity() * 1.35 * diskFalloff(radius, 1.7),
    );
  }
}
