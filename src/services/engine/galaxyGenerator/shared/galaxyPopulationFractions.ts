/**
 * galaxyPopulationFractions — how one galaxy's light divides across bulge,
 * bar, disk, arms and halo. Table dispatch keyed by category, so adding a
 * family means adding a table entry rather than threading a branch through
 * shared logic; 'spiral' and 'barred' share one parameterised entry.
 *
 * These fractions are the population weights themselves. `splitStarBudget`
 * multiplies them by the sprite tier's star budget; the analytic field reads
 * them as they are, which is why `starCount` — a knob that only sizes the
 * sprite bag — cannot move the field's mixture.
 *
 * Formulas ported from galaxy-model.js:89-116, plus `carveStarLayout`'s bar
 * carve expressed as a share of the whole.
 */
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { GalaxyPopulationFractions } from '../../../../@types/galaxy/GalaxyPopulationFractions';

/**
 * A barred galaxy's bar is carved out of the disk, not added beside it —
 * `carveStarLayout` spends this share of `diskCount` on bar stars and leaves
 * the disk the rest, so the two readings stay one number.
 */
export const BAR_SHARE_OF_DISK = 0.35;

type Fractions = (params: GalaxyParams, category: GalaxyCategory) => GalaxyPopulationFractions;

const NONE = { bulge: 0, bar: 0, disk: 0, arm: 0, halo: 0 };

// Smooth spheroid: almost everything is bulge, the rest a diffuse stellar
// halo. No disk, no arms — ellipticals have neither.
const elliptical: Fractions = () => ({ ...NONE, bulge: 0.9, halo: 0.1 });

// Bulge + featureless disk, no spiral structure — the defining trait of S0.
const lenticular: Fractions = () => ({ ...NONE, bulge: 0.55, disk: 0.4, halo: 0.05 });

// Chaotic dwarfs: a small bulge, no smooth exponential disk at all — the bulk
// of the light sits in the irregular "arm-slot" clumps.
const irregular: Fractions = () => ({ ...NONE, bulge: 0.06, arm: 0.86, halo: 0.08 });

// Spiral / barred: the bulge grows with bulgeSize, capped at 0.55, and shrinks
// a touch when barred (bars trade bulge mass for a flatter, more elongated
// core). What's left splits between arms (scaled by armStrength) and a smooth
// disk, of which a barred galaxy's bar then takes its own cut; no halo —
// spirals and barred spirals don't get one. The spike's falsy-fallback
// semantics (|| not ??) mean an explicit bulgeSize of 0 also maps to 1.
const spiralLike: Fractions = (params, category) => {
  const grown = 0.12 + 0.35 * (params.bulgeSize || 1) * (category === 'barred' ? 0.8 : 1);
  const bulge = Math.min(0.55, grown);
  const arm = (1 - bulge) * 0.4 * (params.armStrength ?? 1);
  const diskAndBar = 1 - bulge - arm;
  const bar = category === 'barred' ? diskAndBar * BAR_SHARE_OF_DISK : 0;
  return { bulge, bar, disk: diskAndBar - bar, arm, halo: 0 };
};

const FRACTIONS: Record<GalaxyCategory, Fractions> = {
  elliptical,
  lenticular,
  irregular,
  barred: spiralLike,
  spiral: spiralLike,
};

export function galaxyPopulationFractions(
  category: GalaxyCategory,
  params: GalaxyParams,
): GalaxyPopulationFractions {
  return FRACTIONS[category](params, category);
}
