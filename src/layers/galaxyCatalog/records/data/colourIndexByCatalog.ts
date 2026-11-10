/**
 * COLOUR_INDEX_BY_CATALOG — which two mag slots make each galaxy catalog's colour index, and
 * which classifier reads it. The slots must match each entry's `bandLabels`
 * (`sources/*.ts`): review both when a catalog is added. Total over the catalogs, so a new one
 * is a compile error here until it has a row.
 */

import { Source } from '../../../../data/source';
import { galaxyTypeFromColor } from '../utils/galaxyTypeFromColor';
import { galaxyTypeFromBminusJ } from '../utils/galaxyTypeFromBminusJ';
import { galaxyTypeFromJminusK } from '../utils/galaxyTypeFromJminusK';
import type { ColourIndex } from '../@types/ColourIndex';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';

// The card's tag is a coarse red-vs-blue hint, not science: DESI's mixed BGS/LRG/ELG/QSO
// population has no single red-sequence threshold, and B−J only roughly fits Milliquas' quasars.
const DESI_G_MINUS_R: ColourIndex = {
  bluer: 'magG',
  redder: 'magR',
  classify: galaxyTypeFromColor,
};

export const COLOUR_INDEX_BY_CATALOG: Readonly<Record<GalaxyCatalogSourceType, ColourIndex>> = {
  // u−r: the canonical red-sequence/blue-cloud discriminator (Strateva et al. 2001).
  [Source.SDSS]: { bluer: 'magU', redder: 'magR', classify: galaxyTypeFromColor },
  // Curated entries use SDSS-style slots but mostly carry no photometry: Unknown is usual.
  [Source.FamousGalaxy]: { bluer: 'magU', redder: 'magR', classify: galaxyTypeFromColor },
  [Source.Glade]: { bluer: 'magG', redder: 'magR', classify: galaxyTypeFromBminusJ }, // B, J
  [Source.TwoMRS]: { bluer: 'magG', redder: 'magI', classify: galaxyTypeFromJminusK }, // J, K
  [Source.Milliquas]: { bluer: 'magG', redder: 'magR', classify: galaxyTypeFromBminusJ }, // B, R
  [Source.DesiDeep]: DESI_G_MINUS_R,
  [Source.DesiWedge]: DESI_G_MINUS_R,
  [Source.DesiSgw]: DESI_G_MINUS_R,
};
