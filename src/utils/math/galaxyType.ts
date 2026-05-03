/**
 * Source-aware galaxy-type dispatcher.
 *
 * Each survey carries different photometric bands; using the same colour
 * thresholds for every source would mis-classify non-SDSS rows. This
 * function picks the right classifier based on the source enum, so the
 * InfoCard's "Red, quiescent" / "Blue, star-forming" tag actually reflects
 * the data the survey provides.
 *
 * The dispatch table here mirrors (but does not import) the band-slot
 * mapping in `src/data/sources.ts`'s `BAND_LABELS`. Keeping the two in sync
 * is the price of putting the photometric band layout in one place and the
 * classification thresholds in another — review both whenever a new source
 * is added.
 */

import { Source } from '../../data/sources';
import type { GalaxyTypeInfo } from '../../@types';
import { galaxyTypeFromColor } from './galaxyTypeFromColor';
import { galaxyTypeFromBminusJ } from './galaxyTypeFromBminusJ';
import { galaxyTypeFromJminusK } from './galaxyTypeFromJminusK';

/** Subset of mag fields needed for galaxy classification. */
export type GalaxyTypeMags = {
  magU: number;
  magG: number;
  magR: number;
  magI: number;
  magZ: number;
};

/**
 * Fallback when the source's required bands are missing or non-finite.
 * We use `'green'` (intermediate) rather than `'unknown'` so the InfoCard
 * still shows a neutral colour swatch instead of a special unknown state.
 */
const UNKNOWN: GalaxyTypeInfo = { category: 'green', description: 'Unknown galaxy type' };

export function galaxyType(source: Source, mags: GalaxyTypeMags): GalaxyTypeInfo {
  switch (source) {
    case Source.SDSS:
    case Source.Synthetic: {
      // SDSS u−r is the canonical red-sequence/blue-cloud discriminator
      // (Strateva et al. 2001). Synthetic data is generated to mimic SDSS,
      // so it shares the same band layout and thresholds.
      const ur = mags.magU - mags.magR;
      return Number.isFinite(ur) ? galaxyTypeFromColor(ur) : UNKNOWN;
    }
    case Source.Glade: {
      // GLADE: B in g-slot, J in r-slot (see tools/parsers/glade.ts).
      const bj = mags.magG - mags.magR;
      return Number.isFinite(bj) ? galaxyTypeFromBminusJ(bj) : UNKNOWN;
    }
    case Source.TwoMRS: {
      // 2MRS: J in g-slot, K in i-slot (see tools/parsers/twoMrs.ts).
      const jk = mags.magG - mags.magI;
      return Number.isFinite(jk) ? galaxyTypeFromJminusK(jk) : UNKNOWN;
    }
  }
}
