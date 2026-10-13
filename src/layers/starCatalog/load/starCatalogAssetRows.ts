/**
 * The Layer's authored asset rows: one demand+req row per streamed survey
 * catalog (today, Gaia alone — the three seeded catalogs ship no `.bin`), plus
 * the famous-star meta sidecar. `factory` hands back the slot `create` already
 * minted, so core folds companions over these and core's own rows once
 * without ever building one.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { StarCatalogId } from '../../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import { SOURCE_REGISTRY } from '../../../data/sources';
import { STAR_CATALOG_SOURCE_ROWS } from '../sources/starCatalogSourceRows';

export function starCatalogAssetRows(runtime: StarCatalogRuntime): readonly AssetWiringRow[] {
  const surveyRows = STAR_CATALOG_SOURCE_ROWS.filter(([, entry]) => entry.binBaseName !== null).map(
    ([source]): AssetWiringRow => {
      const id = SOURCE_REGISTRY[source].id as StarCatalogId;
      return {
        key: source,
        factory: () => runtime.catalogs.get(source)!,
        req: (tier) => ({ source, tier }),
        demand: (ctx) =>
          ctx.settings.starCatalogs.enabled &&
          ctx.settings.starCatalogs.items[id]?.enabled === true,
        priority: 50, // one rank for every star catalog: the Earth boot view's own scale rung
      };
    },
  );

  return [
    ...surveyRows,
    // Eager rather than a companion join: the famous stars are a seeded
    // catalog compiled into the bundle, so there is no sibling `.bin` to key
    // demand off, and no tier to embed in the request either.
    {
      key: 'famousStarsMeta',
      factory: () => runtime.famousStarsMeta,
      req: () => undefined,
      demand: () => true,
      priority: 22, // right behind famousGalaxiesMeta; both are tiny and wanted early
    },
  ];
}
