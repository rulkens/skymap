/**
 * The Layer's authored asset rows — demand + request only; every `factory` hands
 * back a slot `create` already minted, so core folds companions over these and
 * core's own rows once (Ruling 10) without ever building one.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../../@types/loading/CompanionAssetRow';
import type { GalaxyCatalogRegistryEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogRegistryEntry';
import type { GalaxyCatalogRuntime } from '../types/GalaxyCatalogRuntime';

import {
  GALAXY_CATALOG_SOURCES,
  HI_RES_LAYER_SIDE_BY_TIER,
  Source,
  SOURCE_REGISTRY,
} from '../../../data/sources';
import { galaxyCatalogRequest } from '../../../services/engine/wiring/galaxyCatalogRequest';

/** One demand+req row per galaxy-catalog entry, derived from the fields it already carries. */
function pointRow(
  runtime: GalaxyCatalogRuntime,
  entry: GalaxyCatalogRegistryEntry,
): AssetWiringRow {
  const source = entry.code;
  const id = entry.id;
  return {
    key: source,
    factory: () => runtime.points.get(source)!,
    req: (tier) => galaxyCatalogRequest(source, tier),
    demand: (ctx) => ctx.settings.galaxyCatalogs.items[id]?.enabled === true,
    priority: entry.priority,
  };
}

export function galaxyCatalogAssetRows(
  runtime: GalaxyCatalogRuntime,
): readonly (AssetWiringRow | CompanionAssetRow)[] {
  return [
    ...GALAXY_CATALOG_SOURCES.map((code) => pointRow(runtime, SOURCE_REGISTRY[code])),

    // Loads once the Famous slot leaves `idle`, so the InfoCard text rides in
    // alongside the binary rather than racing ahead of it.
    {
      key: 'famousGalaxiesMeta',
      factory: () => runtime.famousGalaxiesMeta,
      companionOf: Source.FamousGalaxy,
    },

    // Lazy: only the one-shot `paletteOpened` request triggers it.
    {
      key: 'pgcAlias',
      factory: () => runtime.pgcAlias,
      req: () => undefined,
      demand: (ctx) => ctx.request('paletteOpened'),
      priority: 90, // last: nothing renders from it, and its one-shot trigger tolerates a wait
    },

    // `priority: 1` puts a synchronous GPU allocation at the head of the bounded
    // queue ahead of every download — it holds its pipe for microseconds, and the
    // alternative is a second "allocate outside the queue" mechanism for one row.
    {
      key: 'hiResFamous',
      factory: () => runtime.hiResFamous,
      req: (tier) => ({ layerSide: HI_RES_LAYER_SIDE_BY_TIER[tier] }),
      demand: () => true,
      priority: 1,
    },
  ];
}
