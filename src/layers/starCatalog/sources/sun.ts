import type { SeededStarCatalogSourceEntry } from '../../../@types/data/starCatalog/SeededStarCatalogSourceEntry';
import { Source } from '../../../data/source';

/**
 * The Sun — the near-field descent's aim point, and the origin the whole
 * solar-system scene is expressed relative to.
 *
 * A seeded star catalog of exactly one star, beside the curated map and the
 * S-stars: it is a star, drawn by the star layers, so it gates and captions
 * through `starCatalogs.items.sun` like every other stellar set. Its own row
 * rather than a seat in the famous table because "famous stars off" must leave
 * the descent's aim point on screen — membership, not an `id === 'sun'` branch
 * in a shared loop, is what keeps the two apart.
 *
 * Its caption kind and `sunCaption` fade band stay where they are — those are
 * declutter and pacing concerns rather than visibility routing, and the Sun
 * genuinely does out-rank every other caption.
 */
export const SUN_ENTRY = {
  type: 'starCatalog',
  code: Source.Sun,
  id: 'sun',
  label: 'Sun',
  // A single body at the near-field origin, not a sky patch — allSky:true
  // matches the other non-catalog rows.
  allSky: true,
  // Seeds `starCatalogs.items.sun.enabled`, which the Stars panel now writes.
  visible: true,
  bearsLabel: true,
  labelLayer: 'starCatalog',
  bearsMarker: false,
  detailLabel: 'Sun',
  shortLabel: 'Sun',
  // `plural` is the list/toggle header string, and the panel row for the one
  // Sun reads "Sun" — the singular spelling is deliberate, as it is for Earth.
  plural: 'Sun',
  // Seeded in code from `SCENE_SUN`, so no asset ships for it.
  binBaseName: null,
} as const satisfies SeededStarCatalogSourceEntry;
