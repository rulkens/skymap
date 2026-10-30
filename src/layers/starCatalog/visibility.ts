// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { FOREGROUND_RECEDE } from '../../data/bands/foregroundRecede';
import { SOLAR_SYSTEM_CAPTION_RECEDE } from '../../data/bands/solarSystemCaptionRecede';
import { STAR_CATALOG_IDS } from '../../data/starCatalog/starCatalogIds';
import { SEEDED_STAR_CATALOGS } from '../../data/bodies/seededStarCatalogs';
import { STAR_CATALOG_SOURCE_ROWS } from './sources/starCatalogSourceRows';
import { STAR_BACKDROP_DISSOLVE } from './data/starBackdropDissolve';
import { FAMOUS_STAR_ENTRY } from './sources/famous-star';
import { SUN_ENTRY } from './sources/sun';
import { S_STAR_ENTRY } from './sources/s-star';

// The survey Gaia bin and the S-stars draw no names. A single-parameter `.filter` is what
// lets `tsc` infer the narrowing predicate.
const LABEL_BEARING_STAR_CATALOG_IDS = STAR_CATALOG_SOURCE_ROWS.map(([, entry]) => entry)
  .filter((entry) => entry.bearsLabel)
  .map((entry) => entry.id);

export const starCatalogVisibility = [
  { key: 'sStarTrails', bands: { foreground: FOREGROUND_RECEDE } },
  {
    key: 'starCatalog',
    cluster: 'starCatalogs',
    items: STAR_CATALOG_IDS,
    bodies: SEEDED_STAR_CATALOGS,
    selects: ['starCatalog'],
    // Each seeded set dissolves from its own region; the survey stars keep drawing from far
    // out. No foreground band: each backdrop is 0 long before FOREGROUND_RECEDE starts.
    bands: {
      backdrop: {
        ...STAR_BACKDROP_DISSOLVE,
        from: 'solar-neighbourhood',
        items: [FAMOUS_STAR_ENTRY.id, SUN_ENTRY.id],
      },
      sStarBackdrop: {
        ...STAR_BACKDROP_DISSOLVE,
        from: 'galactic-centre',
        items: [S_STAR_ENTRY.id],
      },
    },
  },
  {
    label: 'starCatalog',
    cluster: 'starCatalogs',
    items: LABEL_BEARING_STAR_CATALOG_IDS,
    of: 'starCatalog',
    recession: 'mild',
    // The curated map fades per star instead (`STAR_MAP_CAPTION_BAND`), which no entry band can.
    bands: { caption: { ...SOLAR_SYSTEM_CAPTION_RECEDE, items: [SUN_ENTRY.id] } },
  },
] as const satisfies readonly VisibilityEntry[];
