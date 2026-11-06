/**
 * The Layer's authored asset rows: one per streamed survey catalog (Gaia alone;
 * the seeded catalogs ship no `.bin`), plus the famous-star meta sidecar.
 */

import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { StarCatalogAssetKey } from '../../@types/StarCatalogAssetKey';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { STAR_CATALOG_SOURCE_ROWS } from '../../sources/starCatalogSourceRows';
import { starCatalogVisibility } from '../../visibility';
import { visibilityEntryOf } from '../../../../utils/visibility/visibilityEntryOf';
import { visibilitySwitchOf } from '../../../../utils/visibility/visibilitySwitchOf';

// The star show entry, by its key: its switch, section rule included, is what demands a catalog.
const STAR_SHOW_ENTRY = visibilityEntryOf(starCatalogVisibility, 'starCatalog');

export function starCatalogAssetRows(
  runtime: StarCatalogRuntime,
): readonly AssetWiringRow<unknown, unknown, StarCatalogAssetKey>[] {
  const surveyRows = STAR_CATALOG_SOURCE_ROWS.filter(([, entry]) => entry.binBaseName !== null).map(
    ([source, { id }]): AssetWiringRow<unknown, unknown, StarCatalogAssetKey> => {
      return {
        key: source,
        slot: runtime.catalogs.get(source)!,
        req: (tier) => ({ source, tier }),
        demand: { fn: (ctx) => visibilitySwitchOf(ctx.settings, STAR_SHOW_ENTRY, id) },
        priority: 50, // one rank for every star catalog: the Earth boot view's own scale rung
        gates: { address: 'starCatalog', item: id },
      };
    },
  );

  return [
    ...surveyRows,
    // Eager, not a companion join: seeded into the bundle, so no sibling `.bin` to key off.
    {
      key: 'famousStarsMeta',
      slot: runtime.famousStarsMeta,
      req: () => undefined,
      demand: { fn: () => true },
      priority: 22, // right behind famousGalaxiesMeta; both are tiny and wanted early
    },
  ];
}
