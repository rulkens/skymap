/**
 * galaxyPopulationCountShares — how one galaxy's STAR COUNT (not light)
 * divides across bulge, bar, disk, arms and halo. Inherited from the legacy
 * sprite-placement model (galaxy-model.js:89-116), tuned by eye — not
 * photometry. Table dispatch keyed by category; 'spiral'/'barred' share one
 * parameterised entry.
 *
 * Light share = this × the population's brightness constant, hand-mirrored
 * (no compiler/test link) between generate.wesl's per-population `* K` and
 * galaxyFieldMixture.ts's `*_BRIGHTNESS`. Real DOF is the PAIR — change one
 * half alone and the tiers disagree about the same galaxy.
 */
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { GalaxyPopulationCountShares } from '../../../../@types/galaxy/GalaxyPopulationCountShares';

/**
 * A barred galaxy's bar is carved out of the disk, not added beside it —
 * `carveStarLayout` spends this share of `diskCount` on bar stars and leaves
 * the disk the rest, so the two readings stay one number.
 */
export const BAR_SHARE_OF_DISK = 0.35;

type CountShareFn = (params: GalaxyParams, category: GalaxyCategory) => GalaxyPopulationCountShares;

const NONE = { bulge: 0, bar: 0, disk: 0, arm: 0, halo: 0 };

// Smooth spheroid: almost everything is bulge, the rest a diffuse stellar
// halo. No disk, no arms — ellipticals have neither.
const elliptical: CountShareFn = () => ({ ...NONE, bulge: 0.9, halo: 0.1 });

// Bulge + featureless disk, no spiral structure — the defining trait of S0.
const lenticular: CountShareFn = () => ({ ...NONE, bulge: 0.55, disk: 0.4, halo: 0.05 });

// Chaotic dwarfs: a small bulge, no smooth exponential disk at all — the bulk
// of the light sits in the irregular "arm-slot" clumps.
const irregular: CountShareFn = () => ({ ...NONE, bulge: 0.06, arm: 0.86, halo: 0.08 });

// Spiral / barred: the bulge grows with bulgeSize, capped at 0.55, and shrinks
// a touch when barred (bars trade bulge mass for a flatter, more elongated
// core). What's left splits between arms (scaled by armStrength) and a smooth
// disk, of which a barred galaxy's bar then takes its own cut; no halo —
// spirals and barred spirals don't get one. The spike's falsy-fallback
// semantics (|| not ??) mean an explicit bulgeSize of 0 also maps to 1.
const spiralLike: CountShareFn = (params, category) => {
  const grown = 0.12 + 0.35 * (params.bulgeSize || 1) * (category === 'barred' ? 0.8 : 1);
  const bulge = Math.min(0.55, grown);
  const arm = (1 - bulge) * 0.4 * (params.armStrength ?? 1);
  const diskAndBar = 1 - bulge - arm;
  const bar = category === 'barred' ? diskAndBar * BAR_SHARE_OF_DISK : 0;
  return { bulge, bar, disk: diskAndBar - bar, arm, halo: 0 };
};

const COUNT_SHARES_BY_CATEGORY: Record<GalaxyCategory, CountShareFn> = {
  elliptical,
  lenticular,
  irregular,
  barred: spiralLike,
  spiral: spiralLike,
};

export function galaxyPopulationCountShares(
  category: GalaxyCategory,
  params: GalaxyParams,
): GalaxyPopulationCountShares {
  return COUNT_SHARES_BY_CATEGORY[category](params, category);
}
