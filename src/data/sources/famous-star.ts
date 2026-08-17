import type { SeededStarCatalogSourceEntry } from '../../@types/data/starCatalog/SeededStarCatalogSourceEntry';
import { Source } from '../source';

/**
 * The curated, true-scale stellar neighbourhood — the hand-picked nearby-star
 * map drawn on the final descent.
 *
 * The curated twin of the survey-wide Gaia bin (GAIA_STARS_ENTRY): both are
 * star catalogs the user toggles as a set, so both key
 * `settings.starCatalogs.items`. This one seeds its records from the body
 * store instead of a `.bin`, which is what `binBaseName: null` says.
 */
export const FAMOUS_STAR_ENTRY = {
  type: 'starCatalog',
  code: Source.FamousStar,
  id: 'famousStar',
  label: 'Famous Star',
  // A collection of bodies sitting at the observer's near field, not a sky
  // patch — allSky:true matches the other non-catalog rows (the coverage-mask
  // logic only consults this flag for galaxy-catalog footprints).
  allSky: true,
  // On by default: the famous stars are part of the baseline near-field scene,
  // resolved only on close approach through their content-layer. The flag never
  // reaches ALL_VISIBLE_MASK (galaxy-catalog rows only), so it's a scene-intent
  // marker, not a bitmask contributor.
  visible: true,
  // The star map captions its members on the final descent, so it bears labels
  // like any other named source — the foreground-labels layer draws them on the
  // NEAR0 slab rather than the COSMO one, which is a routing detail, not a
  // capability difference.
  bearsLabel: true,
  labelLayer: 'starCatalog',
  bearsMarker: false,
  detailLabel: 'Famous Star',
  shortLabel: 'Star',
  plural: 'Famous Stars',
  // Seeded in code from the body store, so no asset ships for it.
  binBaseName: null,
} as const satisfies SeededStarCatalogSourceEntry;
