/**
 * Source-aware galaxy-type dispatcher.
 *
 * Each galaxy catalog carries different photometric bands; using the same colour
 * thresholds for every source would mis-classify non-SDSS rows. This
 * function picks the right classifier based on the source enum, so the
 * InfoCard's "Red, quiescent" / "Blue, star-forming" tag actually reflects
 * the data the galaxy catalog provides.
 *
 * The dispatch table here mirrors (but does not import) the band-slot
 * mapping in each source entry's `bandLabels` (`sources/galaxyCatalogSourceRows.ts`).
 * Keeping the two in sync is the price of putting the photometric band layout in one place and the
 * classification thresholds in another — review both whenever a new source
 * is added.
 */

import { Source } from '../../../../data/source';
import type { GalaxyTypeInfo } from '../@types/GalaxyTypeInfo';
import type { GalaxyTypeMags } from '../@types/GalaxyTypeMags';
import { galaxyTypeFromColor } from './galaxyTypeFromColor';
import { galaxyTypeFromBminusJ } from './galaxyTypeFromBminusJ';
import { galaxyTypeFromJminusK } from './galaxyTypeFromJminusK';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';

/**
 * Fallback when the source's required bands are missing or non-finite.
 * We use `'green'` (intermediate) rather than `'unknown'` so the InfoCard
 * still shows a neutral colour swatch instead of a special unknown state.
 */
const UNKNOWN: GalaxyTypeInfo = { category: 'green', description: 'Unknown galaxy type' };

export function galaxyType(source: GalaxyCatalogSourceType, mags: GalaxyTypeMags): GalaxyTypeInfo {
  switch (source) {
    case Source.SDSS: {
      // SDSS u−r is the canonical red-sequence/blue-cloud discriminator
      // (Strateva et al. 2001).
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
    case Source.FamousGalaxy: {
      // Famous entries use SDSS-style optical slots (see the entry's `bandLabels` in
      // `sources/*.ts`).  Fall back to u−r like SDSS; most curated entries
      // won't carry photometry so UNKNOWN is the usual outcome — that's
      // fine, the InfoCard shows a neutral colour swatch.
      const ur = mags.magU - mags.magR;
      return Number.isFinite(ur) ? galaxyTypeFromColor(ur) : UNKNOWN;
    }
    case Source.Milliquas: {
      // Milliquas: B in g-slot, R in r-slot. B−R is the standard quasar
      // colour discriminator (blue continuum vs reddened/dust-obscured).
      // We reuse the B−J classifier — its threshold semantics aren't a
      // perfect match for the quasar locus, but the InfoCard's tag is a
      // coarse "red vs blue" hint, not a science classification.
      const br = mags.magG - mags.magR;
      return Number.isFinite(br) ? galaxyTypeFromBminusJ(br) : UNKNOWN;
    }
    case Source.DesiDeep:
    case Source.DesiWedge:
    case Source.DesiSgw: {
      // DESI patches (deep cone + dec-band wedge + Sloan Great Wall): g in
      // g-slot, r in r-slot (DERED optical fluxes; see the entry's `bandLabels` in
      // `sources/*.ts`). g−r is the natural SDSS-like optical discriminator, so
      // this reuses the SDSS-style colour classifier — the mixed BGS/LRG/ELG/QSO
      // population doesn't have a single established red-sequence threshold, but
      // a coarse "red vs blue" InfoCard tag is all this branch needs to provide.
      const gr = mags.magG - mags.magR;
      return Number.isFinite(gr) ? galaxyTypeFromColor(gr) : UNKNOWN;
    }
  }
}
