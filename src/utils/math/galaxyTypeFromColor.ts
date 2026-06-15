/**
 * Heuristic galaxy classification from the u−r colour index.
 *
 * The "red sequence" / "blue cloud" bimodality is a well-known feature of
 * galaxy colour distributions in u−r space. Classifying galaxies this way
 * allows the UI to tint points and display a human-readable description in
 * the info card, giving the viewer immediate intuition about a galaxy's
 * stellar population and star-formation rate.
 *
 * References:
 *   Strateva et al. 2001, AJ 122, 1861.
 *   Baldry et al. 2004, ApJ 600, 681.
 */

import type { GalaxyTypeInfo } from '../../@types/data/galaxyCatalog/GalaxyTypeInfo';

/**
 * Heuristic galaxy classification from the u−r colour index.
 *
 * The "red sequence" / "blue cloud" bimodality is a well-known feature of
 * galaxy colour distributions in u−r space:
 *   - u − r > 2.2  → red, quiescent (likely elliptical or S0; dominated by
 *                     old, red stellar populations with low star-formation rate)
 *   - u − r ≤ 2.2  → blue, star-forming (likely spiral or irregular; young,
 *                     hot O/B stars shift the integrated colour blueward)
 *
 * The threshold 2.2 is the canonical value from Strateva et al. 2001 for
 * separating early- and late-type galaxies in SDSS u−r colour.
 *
 * Returns 'unknown' when `uMinusR` is NaN (e.g. missing or flagged
 * photometry in the catalog).
 *
 * References:
 *   Strateva et al. 2001, AJ 122, 1861.
 *   Baldry et al. 2004, ApJ 600, 681.
 *
 * @param uMinusR  SDSS u-band minus r-band magnitude difference. Higher
 *                 values indicate redder integrated stellar populations.
 */
export function galaxyTypeFromColor(uMinusR: number): GalaxyTypeInfo {
  // NaN comparison is always false in JS, so an explicit isNaN check is the
  // clearest way to handle missing photometry.
  if (Number.isNaN(uMinusR)) {
    return { category: 'unknown', description: 'Unknown type (missing photometry)' };
  }

  // Threshold from Strateva et al. 2001.
  if (uMinusR > 2.2) {
    return {
      category: 'red',
      description: 'Red, quiescent galaxy (likely elliptical or lenticular)',
    };
  }

  return {
    category: 'blue',
    description: 'Blue, star-forming galaxy (likely spiral or irregular)',
  };
}
