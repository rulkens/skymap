/**
 * The Layer's future `sources` field (`Layer.d.ts`'s `Sources` bound), in
 * `GALAXY_CATALOG_SOURCES` order: draw order for `catalogStore`'s
 * back-to-front iteration, UI order for the panel. Listed explicitly, not
 * derived from `Source`, so a new enum code isn't silently promoted into
 * the UI and the visibility mask.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { SYNTHETIC_ENTRY } from './synthetic';
import { FAMOUS_GALAXY_ENTRY } from './famous-galaxy';
import { TWOMRS_ENTRY } from './twomrs';
import { SDSS_ENTRY } from './sdss';
import { GLADE_ENTRY } from './glade';
import { MILLIQUAS_ENTRY } from './milliquas';
import { DESI_DEEP_ENTRY } from './desiDeep';
import { DESI_WEDGE_ENTRY } from './desiWedge';
import { DESI_SGW_ENTRY } from './desiSgw';

export const GALAXY_CATALOG_SOURCE_ROWS = [
  [Source.Synthetic, SYNTHETIC_ENTRY],
  [Source.FamousGalaxy, FAMOUS_GALAXY_ENTRY],
  [Source.TwoMRS, TWOMRS_ENTRY],
  [Source.SDSS, SDSS_ENTRY],
  [Source.Glade, GLADE_ENTRY],
  [Source.Milliquas, MILLIQUAS_ENTRY],
  [Source.DesiDeep, DESI_DEEP_ENTRY],
  [Source.DesiWedge, DESI_WEDGE_ENTRY],
  [Source.DesiSgw, DESI_SGW_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
