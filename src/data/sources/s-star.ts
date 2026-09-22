import type { SeededStarCatalogSourceEntry } from '../../@types/data/starCatalog/SeededStarCatalogSourceEntry';
import { Source } from '../source';

/**
 * The bound S-stars of the Galactic Centre — one registry row for all 39.
 *
 * A seeded star catalog: they are stars, drawn by the star layers from a seed
 * table, so they toggle as a set through `starCatalogs.items.sStar` like the
 * curated map. Their POSITIONS remain Keplerian about Sgr A\* — `orbitalElements`
 * still drives them — which is a motion model, not a registry kind.
 */
export const S_STAR_ENTRY = {
  type: 'starCatalog',
  code: Source.SStar,
  id: 'sStar',
  label: 'S-Star',
  // A tight cluster at one point on the sky, not a survey footprint —
  // allSky:true matches the other non-catalog rows.
  allSky: true,
  visible: true,
  // No captions: 39 names inside a few arcseconds would pile into an unreadable
  // smear, and Sgr A* already names the place. So no `labelLayer`/`detailLabel`/
  // `shortLabel`/`plural` either — those are present iff `bearsLabel`.
  bearsLabel: false,
  bearsMarker: false,
  // Seeded in code from `SCENE_S_STARS`, so no asset ships for it.
  binBaseName: null,
} as const satisfies SeededStarCatalogSourceEntry;
