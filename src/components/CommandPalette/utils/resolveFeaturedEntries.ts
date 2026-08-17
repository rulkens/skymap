/**
 * resolveFeaturedEntries — resolve the curated `FEATURED_IDS` list against
 * the loaded famous entries so the featured grid renders real thumbnails +
 * display names rather than ids.  Any id missing from the catalog is dropped
 * silently — the grid just gets a little shorter.  Order is preserved so the
 * curator's intent (most recognisable first) survives the resolution.
 */
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';

/**
 * Featured galaxies shown as a 5×3 thumbnail grid above the list when
 * the palette opens with no query.  Curated by name recognition: the
 * first row is "households know it" (Andromeda, Whirlpool, Sombrero,
 * the EHT-imaged M87, Centaurus A); the second is "every space-
 * interested person knows" (Cigar/Bode pair, Pinwheel, Triangulum,
 * Black Eye); the third is "amateur-astronomer favourites" (Southern
 * Pinwheel, Phantom, Cetus A's Seyfert, NGC 7331, Fireworks Galaxy).
 *
 * Order matters: the eye reads left-to-right, top-to-bottom, so the
 * most recognisable picks sit in the first row.  Edit this list to
 * change the lineup; the grid silently skips any id missing from the
 * loaded famous catalog so a misconfigured prod environment doesn't
 * crash the palette.
 */
const FEATURED_IDS: readonly string[] = [
  'm31', // Andromeda
  'm51', // Whirlpool
  'm104', // Sombrero
  'm87', // EHT first-image
  'c77', // Centaurus A (NGC 5128)
  'm82', // Cigar
  'm81', // Bode's
  'm101', // Pinwheel
  'm33', // Triangulum
  'm64', // Black Eye
  'm83', // Southern Pinwheel
  'm74', // Phantom (Webb 2022)
  'm77', // Cetus A / Seyfert prototype
  'c45', // NGC 7331 (Andromeda's twin)
  'c12', // Fireworks Galaxy (NGC 6946)
];

export function resolveFeaturedEntries(entries: readonly FamousGalaxyMetaEntry[]): FamousGalaxyMetaEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return FEATURED_IDS.flatMap((id) => {
    const e = byId.get(id);
    return e ? [e] : [];
  });
}
