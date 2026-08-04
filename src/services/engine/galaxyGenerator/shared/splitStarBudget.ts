/**
 * splitStarBudget — turns `galaxyPopulationCountShares` into the integer star
 * counts the sprite tier draws. The shares live in that module; all this file
 * adds is the quantisation, which is the one thing a star bag needs and the
 * analytic field must not inherit.
 */
import { galaxyPopulationCountShares } from './galaxyPopulationCountShares';
import { totalStarBudget } from './totalStarBudget';
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { StarBudget } from '../../../../@types/galaxy/StarBudget';

/** The five `StarBudget` populations — holding their shares, or their counts. */
type ByPopulation = { -readonly [K in keyof Omit<StarBudget, 'totalStars'>]: number };

/**
 * Populations in the order they take their cut. Each populated one floors its
 * own share and the LAST of them absorbs what rounding left over, so the five
 * counts always re-sum to `totalStars`. A population whose share is not
 * positive stays at exactly zero: a stray star in an elliptical's disk would
 * carve a disk range and run a disk builder that category has no business
 * running.
 */
const CUT_ORDER = ['bulgeCount', 'barCount', 'armStarCount', 'diskCount', 'haloCount'] as const;

export function splitStarBudget(category: GalaxyCategory, params: GalaxyParams): StarBudget {
  const totalStars = totalStarBudget(params);
  const fractions = galaxyPopulationCountShares(category, params);
  const shares: ByPopulation = {
    bulgeCount: fractions.bulge,
    barCount: fractions.bar,
    armStarCount: fractions.arm,
    diskCount: fractions.disk,
    haloCount: fractions.halo,
  };

  const counts: ByPopulation = {
    bulgeCount: 0,
    barCount: 0,
    diskCount: 0,
    armStarCount: 0,
    haloCount: 0,
  };
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
