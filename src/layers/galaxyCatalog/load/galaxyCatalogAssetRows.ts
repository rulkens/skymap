/** The Layer's authored asset rows: demand + request only; every `slot` comes from the runtime. */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../../@types/loading/CompanionAssetRow';
import type { GalaxyCatalogRegistryEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogRegistryEntry';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';

import { Source } from '../../../data/source';
import { APP_SOURCE_REGISTRY } from '../../../compositions/appSources';
import { GALAXY_CATALOG_SOURCES } from '../sources/galaxyCatalogSources';
import { HI_RES_LAYER_SIDE_BY_TIER } from '../data/hiResLayerSideByTier';
import { tierTarget } from '../../../data/tierTargets';
import type { Tier } from '../../../@types/data/Tier';
import { galaxyCatalogRequest } from '../../../services/engine/wiring/galaxyCatalogRequest';

function pointRow(
  runtime: GalaxyCatalogRuntime,
  entry: GalaxyCatalogRegistryEntry,
): AssetWiringRow {
  const source = entry.code;
  const id = entry.id;
  // Target 0 means the tier ships no file for this source (SDSS at `small`);
  // a source with no caps has no target and is never excluded.
  const excluded = (tier: Tier) => tierTarget(source, tier) === 0;
  return {
    key: source,
    slot: runtime.points.get(source)!,
    req: (tier) => galaxyCatalogRequest(source, tier),
    demand: (ctx) => ctx.settings.galaxyCatalogs.items[id]?.enabled === true && !excluded(ctx.tier),
    release: (ctx) => excluded(ctx.tier),
    priority: entry.priority,
    gates: { address: 'survey', item: id },
  };
}

export function galaxyCatalogAssetRows(
  runtime: GalaxyCatalogRuntime,
): readonly (AssetWiringRow | CompanionAssetRow)[] {
  return [
    ...GALAXY_CATALOG_SOURCES.map((code) => pointRow(runtime, APP_SOURCE_REGISTRY[code])),

    // Loads once the Famous slot leaves `idle`.
    {
      key: 'famousGalaxiesMeta',
      slot: runtime.famousGalaxiesMeta,
      companionOf: Source.FamousGalaxy,
    },

    // Lazy: only demanded while the command palette is open — see
    // `watchPaletteWakeSaga`'s header for why opening it must also wake a frame.
    {
      key: 'pgcAlias',
      slot: runtime.pgcAlias,
      req: () => undefined,
      demand: (ctx) => ctx.ui.paletteOpen,
      priority: 90, // last: nothing renders from it, and it tolerates a wait
    },

    // `priority: 1`: a synchronous GPU allocation that holds its pipe for microseconds,
    // so it heads the queue rather than needing a second mechanism.
    {
      key: 'hiResFamous',
      slot: runtime.hiResFamous,
      req: (tier) => ({ layerSide: HI_RES_LAYER_SIDE_BY_TIER[tier] }),
      demand: () => true,
      priority: 1,
    },
  ];
}
