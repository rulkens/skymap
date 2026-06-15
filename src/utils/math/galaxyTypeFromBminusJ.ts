/**
 * Coarse galaxy classification from B−J colour index.
 *
 * Thresholds are calibrated against the GLADE+ catalogue's B (HyperLEDA) and
 * J (2MASS XSC) magnitudes: late-type spirals cluster around B−J = 1.0,
 * green-valley galaxies near 2.0, and ellipticals/red sequence ≥ 2.5.
 *
 * Why these thresholds and not u−r's? The optical-NIR baseline B−J spans a
 * much wider range (~0.5..3.5) than the SDSS u−r baseline used by
 * `galaxyTypeFromColor`, because the J-band sits well past the 4000 Å break
 * and so reddens dramatically for old stellar populations. A direct port of
 * the u−r threshold (2.2) would put almost every GLADE galaxy on the red
 * sequence — we need a higher cut (2.5) plus an explicit green-valley bin
 * (1.5..2.5) to recover the bimodality.
 *
 * Returns the same `GalaxyTypeInfo` shape as the existing u−r-based
 * classifier so the InfoCard treats every source uniformly.
 */

import type { GalaxyTypeInfo } from '../../@types/data/galaxyCatalog/GalaxyTypeInfo';

export function galaxyTypeFromBminusJ(bj: number): GalaxyTypeInfo {
  if (bj < 1.5) return { category: 'blue', description: 'Blue, star-forming galaxy' };
  if (bj < 2.5) return { category: 'green', description: 'Intermediate-colour galaxy' };
  return { category: 'red', description: 'Red, quiescent galaxy' };
}
