/**
 * buildIrregularDust — dust patches following the star-forming clump seeds
 * `buildIrregularClumps` produced, with the same dense-knot/thin-wisp split
 * as `buildArmDust` but wider spreads — irregulars have no ordered disk to
 * confine dust to a thin plane. Ported from galaxy-model.js:584-598.
 *
 * `irrDustBudget` is a hard cap, not a target, same as `buildArmDust`.
 */
import type { DustField } from '../../../@types/model/DustField';
import type { DustSeed } from '../../../@types/model/DustSeed';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';

export function buildIrregularDust(
  ctx: GalaxyBuildContext,
  field: DustField,
  seeds: readonly DustSeed[],
): void {
  const { params, rand, randNormal, outerRadius, diskHeight, grainScale, addDust, dust } = ctx;
  const { dustMod } = field;
  const dustAmount = params.dust ?? 1;
  const irrDustBudget = Math.floor((16000 * dustAmount) / (grainScale * grainScale));

  for (let i = 0; i < seeds.length && dust.count() < irrDustBudget; i++) {
    const seed = seeds[i]!;
    const dense = rand() < 0.3;
    const x = seed.x + randNormal() * outerRadius * 0.03;
    const y = seed.y + randNormal() * diskHeight * 0.6;
    const z = seed.z + randNormal() * outerRadius * 0.03;
    const m = dustMod(x, y, z);
    if (!m.keep) continue;
    addDust(
      x,
      y,
      z,
      outerRadius * (0.008 + 0.016 * rand()) * grainScale * (dense ? 1.2 : 0.8) * m.sz,
      (dense ? 0.16 + 0.22 * rand() : 0.05 + 0.11 * rand()) * dustAmount * m.op,
    );
  }
}
