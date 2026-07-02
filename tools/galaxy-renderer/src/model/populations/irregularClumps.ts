/**
 * buildIrregularClumps — clumpy star formation around scattered centres plus
 * an LMC-style offset bar, for `category === 'irregular'` galaxies (dwarfs
 * with no smooth exponential disk or logarithmic spiral arms — they use this
 * builder instead of `buildSpiralArms` for their `armStarCount` share).
 * Ported from galaxy-model.js:406-434.
 *
 * Guards on `ctx.category !== 'irregular'` the same way `buildBar` guards on
 * `'barred'` — a defensive no-op rather than trusting the orchestrator alone,
 * since this builder also draws 7 clump centres from the *main* `rand`/
 * `randNormal` streams before the per-star loop even starts.
 *
 * Every loop iteration writes at least one star record (HII knots write two,
 * everything else writes one) — unlike `buildSpiralArms` there is no
 * density-gap `continue`, so the final star count is always
 * `>= ctx.budget.armStarCount`. Dust seeds here carry `armFade: 1` (the spike
 * leaves that slot `undefined` at push time — model.js:432 — and the dust
 * pass defaults a missing value to 1 downstream, model.js:527; normalising it
 * at emission here is the same behaviour, made explicit).
 */
import { tempColor } from '../tempColor';
import type { DustSeed } from '../../../@types/model/DustSeed';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const NUM_CLUMPS = 7;

export function buildIrregularClumps(ctx: GalaxyBuildContext): DustSeed[] {
  const dustSeeds: DustSeed[] = [];
  const { category } = ctx;
  if (category !== 'irregular') return dustSeeds;

  const {
    rand,
    randNormal,
    params,
    outerRadius,
    diskHeight,
    starSize,
    randomLuminosity,
    addStar,
    hii,
    budget,
  } = ctx;

  const clumpCenters: Vec3[] = [];
  for (let c = 0; c < NUM_CLUMPS; c++) {
    const a = rand() * Math.PI * 2;
    const dist = outerRadius * (0.15 + 0.7 * rand());
    clumpCenters.push([
      Math.cos(a) * dist * 1.1,
      randNormal() * diskHeight * 3,
      Math.sin(a) * dist,
    ]);
  }
  const barOffset = outerRadius * 0.18; // the LMC-like off-centre bar
  const hiiIntensity = params.hii ?? 1;
  const rgb: Vec3 = [0, 0, 0];

  for (let i = 0; i < budget.armStarCount; i++) {
    const center = clumpCenters[i % NUM_CLUMPS]!;
    const spread = outerRadius * 0.16;
    const x = center[0] + randNormal() * spread + barOffset;
    const y = center[1] + randNormal() * diskHeight * 2;
    const z = center[2] + randNormal() * spread;
    const isHiiRegion = rand() < 0.02 * hiiIntensity;
    if (isHiiRegion) {
      const giant = Math.pow(rand(), 2.5);
      const coreSize = outerRadius * (0.006 + 0.024 * giant); // giant complexes dominate irregulars
      const coreBright = (1.6 + 1.4 * rand()) * (0.8 + 1.6 * giant);
      addStar(x, y, z, hii.halo[0], hii.halo[1], hii.halo[2], coreSize * 1.9, coreBright * 0.22);
      const cv = 0.1 * rand();
      addStar(
        x,
        y,
        z,
        hii.core[0],
        Math.min(1, hii.core[1] + cv),
        Math.min(1, hii.core[2] + cv),
        coreSize,
        coreBright,
      );
    } else {
      tempColor(0.66 + 0.3 * rand(), rgb);
      addStar(x, y, z, rgb[0], rgb[1], rgb[2], starSize * (0.9 + 0.7 * rand()), randomLuminosity());
    }
    if (rand() < 0.25) {
      dustSeeds.push({ x, y, z, radius: Math.hypot(x, z), angle: Math.atan2(z, x), armFade: 1 });
    }
  }

  return dustSeeds;
}
