/**
 * splitStarBudget — turns `galaxyPopulationFractions` into the integer star
 * counts the sprite tier draws. The per-category shares live in that table;
 * all this file adds is the quantisation, which is the one thing a star bag
 * needs and the analytic field must not inherit.
 *
 * `diskCount` still carries the bar's stars: `carveStarLayout` is what splits
 * them off, and the shader's loop bounds are written against that pair.
 */
import { galaxyPopulationFractions } from './galaxyPopulationFractions';
import { totalStarBudget } from './totalStarBudget';
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { StarBudget } from '../../../../@types/galaxy/StarBudget';

/** The four `StarBudget` populations — holding their shares, or their counts. */
type ByPopulation = { -readonly [K in keyof Omit<StarBudget, 'totalStars'>]: number };

/**
 * Populations in the order they take their cut. Each populated one floors its
 * own share and the LAST of them absorbs what rounding left over, so the four
 * counts always re-sum to `totalStars` — with the leftover landing where the
 * spike's own formulas put it (the halo, or the disk for spirals, which have
 * none). A population whose share is not positive stays at exactly zero: a
 * stray star in an elliptical's disk would carve a disk range and run a disk
 * builder that category has no business running, and an armStrength past 2.5
 * (preset JSON only — the slider stops at 1.5) leaves the disk share negative.
 */
const CUT_ORDER = ['bulgeCount', 'armStarCount', 'diskCount', 'haloCount'] as const;

export function splitStarBudget(category: GalaxyCategory, params: GalaxyParams): StarBudget {
  const totalStars = totalStarBudget(params);
  const fractions = galaxyPopulationFractions(category, params);
  const shares: ByPopulation = {
    bulgeCount: fractions.bulge,
    armStarCount: fractions.arm,
    diskCount: fractions.disk + fractions.bar,
    haloCount: fractions.halo,
  };

  const counts: ByPopulation = { bulgeCount: 0, diskCount: 0, armStarCount: 0, haloCount: 0 };
  const populated = CUT_ORDER.filter((key) => shares[key] > 0);
  let assigned = 0;
  populated.forEach((key, i) => {
    const count =
      i === populated.length - 1 ? totalStars - assigned : Math.floor(totalStars * shares[key]);
    counts[key] = count;
    assigned += count;
  });

  return { totalStars, ...counts };
}
