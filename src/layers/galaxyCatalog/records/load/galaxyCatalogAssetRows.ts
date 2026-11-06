/** The Layer's authored asset rows: demand + request only; every `slot` comes from the runtime. */

import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { GalaxyCatalogAssetKey } from '../../@types/GalaxyCatalogAssetKey';
import type { CompanionAssetRow } from '../../../../@types/loading/CompanionAssetRow';
import type { GalaxyCatalogRegistryEntry } from '../../@types/GalaxyCatalogRegistryEntry';
import type { GalaxyCatalogRuntime } from '../../@types/GalaxyCatalogRuntime';

import { Source } from '../../../../data/source';
import { GALAXY_CATALOG_SOURCE_RECORD } from '../../sources/galaxyCatalogSourceRecord';
import { GALAXY_CATALOG_SOURCES } from '../../sources/galaxyCatalogSources';
import { HI_RES_LAYER_SIDE_BY_TIER } from '../../hiResFamous/data/hiResLayerSideByTier';
import { tierTarget } from '../data/tierTargets';
import { TIER_LADDER } from '../../../../data/tierLadder';
import { galaxyCatalogRequest } from '../../../../services/engine/wiring/galaxyCatalogRequest';

function pointRow(
  runtime: GalaxyCatalogRuntime,
  entry: GalaxyCatalogRegistryEntry,
): AssetWiringRow<unknown, unknown, GalaxyCatalogAssetKey> {
  const source = entry.code;
  const id = entry.id;
  return {
    key: source,
    slot: runtime.points.get(source)!,
    req: (tier) => galaxyCatalogRequest(source, tier),
    // Target 0 means the tier ships no file for this source (SDSS at `small`); a source
    // with no caps has no target and is listed at every tier.
    demand: { tiers: TIER_LADDER.filter((tier) => tierTarget(source, tier) !== 0) },
    priority: entry.priority,
    gates: { address: 'survey', item: id },
  };
}

export function galaxyCatalogAssetRows(
  runtime: GalaxyCatalogRuntime,
): readonly (
  | AssetWiringRow<unknown, unknown, GalaxyCatalogAssetKey>
  | CompanionAssetRow<unknown, unknown, GalaxyCatalogAssetKey>
)[] {
  return [
    ...GALAXY_CATALOG_SOURCES.map((code) => pointRow(runtime, GALAXY_CATALOG_SOURCE_RECORD[code])),

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
      demand: 'whenSearching',
      priority: 90, // last: nothing renders from it, and it tolerates a wait
    },

    // `priority: 1`: a synchronous GPU allocation that holds its pipe for microseconds,
    // so it heads the queue rather than needing a second mechanism.
    {
      key: 'hiResFamous',
      slot: runtime.hiResFamous,
      req: (tier) => ({ layerSide: HI_RES_LAYER_SIDE_BY_TIER[tier] }),
      demand: 'always',
      priority: 1,
    },
  ];
}
