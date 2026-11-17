/**
 * The Layer's future `sources` field (`Layer.d.ts`'s `Sources` bound), in
 * `GALAXY_CATALOG_SOURCES` order: draw order for `catalogStore`'s
 * back-to-front iteration, UI order for the panel. Listed explicitly, so a new
 * entry isn't silently promoted into the UI and the visibility set.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { FAMOUS_GALAXY_ENTRY } from './famous-galaxy';
import { TWOMRS_ENTRY } from './twomrs';
import { SDSS_ENTRY } from './sdss';
import { GLADE_ENTRY } from './glade';
import { MILLIQUAS_ENTRY } from './milliquas';
import { DESI_DEEP_ENTRY } from './desiDeep';
import { DESI_WEDGE_ENTRY } from './desiWedge';
import { DESI_SGW_ENTRY } from './desiSgw';

export const GALAXY_CATALOG_SOURCE_ROWS = [
  FAMOUS_GALAXY_ENTRY,
  TWOMRS_ENTRY,
  SDSS_ENTRY,
  GLADE_ENTRY,
  MILLIQUAS_ENTRY,
  DESI_DEEP_ENTRY,
  DESI_WEDGE_ENTRY,
  DESI_SGW_ENTRY,
] as const satisfies readonly SourceEntry[];
