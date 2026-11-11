/** The Layer's authored asset rows: demand + request only; every `slot` comes from the runtime. */

import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { GalaxyCatalogAssetKey } from '../../@types/GalaxyCatalogAssetKey';
import type { CompanionAssetRow } from '../../../../@types/loading/CompanionAssetRow';
import type { GalaxyCatalogRegistryEntry } from '../../@types/GalaxyCatalogRegistryEntry';
import type { GalaxyCatalogRuntime } from '../../@types/GalaxyCatalogRuntime';

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
  const id = entry.id;
  return {
    key: id,
    slot: runtime.points.get(id)!,
    req: (tier) => galaxyCatalogRequest(id, tier),
    // Famous stays resident when switched off: its ids are the names focus links and tour
    // beats resolve through, and a tour shows it in the clip that first needs one resolved.
    // Target 0 means the tier ships no file for this source (SDSS at `small`); a source
    // with no caps has no target and is listed at every tier.
    demand:
      id === 'famousGalaxy'
        ? 'always'
        : {
            tiers: TIER_LADDER.filter((tier) => tierTarget(id, tier) !== 0),
            near: { band: 'deepZoom', edge: 'in', lead: 10, release: 100 },
            alsoWhen: ['searching'],
          },
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
    ...GALAXY_CATALOG_SOURCES.map((id) => pointRow(runtime, GALAXY_CATALOG_SOURCE_RECORD[id])),

    // Loads once the Famous slot leaves `idle`.
    {
      key: 'famousGalaxiesMeta',
      slot: runtime.famousGalaxiesMeta,
      companionOf: 'famousGalaxy',
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
