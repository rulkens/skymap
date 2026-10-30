/** The Layer's authored asset rows: demand + request only; every `slot` comes from the runtime. */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../../@types/loading/CompanionAssetRow';
import type { GalaxyCatalogRegistryEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogRegistryEntry';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyOctreeReq } from '../../../@types/loading/GalaxyOctreeReq';
import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { GalaxyCatalogSourceEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';

import { Source } from '../../../data/source';
import { APP_SOURCE_REGISTRY } from '../../../compositions/appSources';
import { GALAXY_CATALOG_SOURCES } from '../sources/galaxyCatalogSources';
import { HI_RES_LAYER_SIDE_BY_TIER } from '../data/hiResLayerSideByTier';
import { tierTarget } from '../../../data/tierTargets';
import type { Tier } from '../../../@types/data/Tier';
import { galaxyCatalogFormatOf } from '../../../utils/galaxyCatalogFormatOf';
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
    demand: (ctx) =>
      ctx.settings.galaxyCatalogs.items[id]?.enabled === true &&
      !excluded(ctx.tier) &&
      formatOf(ctx, source) === 'skmp',
    // Switching the source to its octree drops these points, so the two never draw together.
    release: (ctx) => excluded(ctx.tier) || formatOf(ctx, source) !== 'skmp',
    priority: entry.priority,
    gates: { address: 'survey', item: id },
  };
}

/** The octree slot of a row that ships one: demanded, and released, by the source's format. */
function octreeRow(
  runtime: GalaxyCatalogRuntime,
  entry: GalaxyCatalogRegistryEntry,
): AssetWiringRow {
  const source = entry.code;
  const id = entry.id;
  return {
    key: `galaxyOctree:${id}`,
    slot: runtime.octreePoints.get(source)!,
    req: (tier): GalaxyOctreeReq => ({ source, tier }),
    demand: (ctx) =>
      ctx.settings.galaxyCatalogs.items[id]?.enabled === true && formatOf(ctx, source) === 'octree',
    release: (ctx) => formatOf(ctx, source) !== 'octree',
    priority: entry.priority,
    // Gates the same item as the point row: either slot's data is the source's presence.
    gates: { address: 'survey', item: id },
  };
}

const formatOf = (ctx: DemandCtx, source: GalaxyCatalogSourceType) =>
  galaxyCatalogFormatOf(ctx.settings.galaxyCatalogs.formats, source);

export function galaxyCatalogAssetRows(
  runtime: GalaxyCatalogRuntime,
): readonly (AssetWiringRow | CompanionAssetRow)[] {
  return [
    ...GALAXY_CATALOG_SOURCES.map((code) => pointRow(runtime, APP_SOURCE_REGISTRY[code])),
    ...GALAXY_CATALOG_SOURCES.filter(
      (code) => (APP_SOURCE_REGISTRY[code] as GalaxyCatalogSourceEntry).octree !== undefined,
    ).map((code) => octreeRow(runtime, APP_SOURCE_REGISTRY[code])),

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
