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
 * mapping in `src/data/sources.ts`'s `BAND_LABELS`. Keeping the two in sync
 * is the price of putting the photometric band layout in one place and the
 * classification thresholds in another — review both whenever a new source
 * is added.
 */

import { Source } from '../../data/sources';
import type { GalaxyTypeInfo } from '../../@types/data/galaxyCatalog/GalaxyTypeInfo';
import type { GalaxyTypeMags } from '../../@types/data/galaxyCatalog/GalaxyTypeMags';
import { galaxyTypeFromColor } from './galaxyTypeFromColor';
import { galaxyTypeFromBminusJ } from './galaxyTypeFromBminusJ';
import { galaxyTypeFromJminusK } from './galaxyTypeFromJminusK';
import type { SourceType } from '../../@types/data/SourceType';

/**
 * Fallback when the source's required bands are missing or non-finite.
 * We use `'green'` (intermediate) rather than `'unknown'` so the InfoCard
 * still shows a neutral colour swatch instead of a special unknown state.
 */
const UNKNOWN: GalaxyTypeInfo = { category: 'green', description: 'Unknown galaxy type' };

export function galaxyType(source: SourceType, mags: GalaxyTypeMags): GalaxyTypeInfo {
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
    case Source.FamousGalaxy: {
      // Famous entries use SDSS-style optical slots (see BAND_LABELS in
      // sources.ts).  Fall back to u−r like SDSS; most curated entries
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
      // g-slot, r in r-slot (DERED optical fluxes; see BAND_LABELS in
      // sources.ts). g−r is the natural SDSS-like optical discriminator, so
      // this reuses the SDSS-style colour classifier — the mixed BGS/LRG/ELG/QSO
      // population doesn't have a single established red-sequence threshold, but
      // a coarse "red vs blue" InfoCard tag is all this branch needs to provide.
      const gr = mags.magG - mags.magR;
      return Number.isFinite(gr) ? galaxyTypeFromColor(gr) : UNKNOWN;
    }
    case Source.Cluster:
    case Source.Supercluster:
    case Source.Void:
    case Source.Group:
    case Source.Filaments:
    case Source.Cf4Density:
    case Source.Mcpm:
    case Source.DebugGaussian:
    case Source.DebugCartesian:
    case Source.DebugSpherical:
    case Source.MilkyWay:
    case Source.Flow:
    case Source.FamousStar:
    case Source.Planet:
    case Source.Earth:
    case Source.Sun:
    case Source.SgrAStar:
    case Source.SStar:
    case Source.GaiaStars:
    case Source.Constellations:
    case Source.ZoneOfAvoidance:
      // Non-galaxy catalog sources have no galaxy type. Most (structure
      // markers, filaments, volumes, the Milky-Way + flow overlays, and body
      // sources like the planets, Earth and the Sun) carry no per-record photometry
      // at all. The Gaia star catalog is the exception that proves the rule:
      // it's a point-source star survey whose records DO carry photometry,
      // but stellar photometry is not galaxy photometry, so it has no galaxy
      // classification either. Reaching this branch
      // indicates the InfoCard is rendering a galaxy row for a
      // non-galaxy catalog pick / handle; route those through their own info
      // panel instead.
      throw new Error(
        `galaxyType: non-galaxy catalog source ${source} has no galaxy classification`,
      );
  }
}
