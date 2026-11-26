/**
 * The Layer's asset rows, one per source row, keyed by its id. Switching a
 * cube off releases it, and the slot's `onRelease` frees its GPU textures.
 */

import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { CosmicWebDensityAssetKey } from '../../@types/CosmicWebDensityAssetKey';
import type { CosmicWebDensityRuntime } from '../../@types/CosmicWebDensityRuntime';

import type { CosmicWebDensityReq } from '../@types/CosmicWebDensityReq';
import { DENSITY_BASE_LEVEL_BY_TIER } from '../data/densityBaseLevelByTier';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../sources/cosmicWebDensitySourceRows';

export function cosmicWebDensityAssetRows(
  runtime: CosmicWebDensityRuntime,
): readonly AssetWiringRow<unknown, unknown, CosmicWebDensityAssetKey>[] {
  return COSMIC_WEB_DENSITY_SOURCE_ROWS.map(
    (entry): AssetWiringRow<unknown, unknown, CosmicWebDensityAssetKey> => ({
      key: entry.id,
      slot: runtime.slots[entry.id],
      // The workbench request carries no `baseLevel`, so a tier flip leaves it unchanged and the
      // demand loop never reloads it.
      req: (tier): CosmicWebDensityReq =>
        entry.storage === 'pyramid'
          ? {
              storage: 'pyramid',
              binBaseName: entry.binBaseName,
              baseLevel: DENSITY_BASE_LEVEL_BY_TIER[tier],
            }
          : { storage: 'scfd', binBaseName: entry.binBaseName },
      demand: { near: { band: 'deepZoom', edge: 'in', lead: 10, release: 100 } },
      priority: entry.priority,
      gates: { address: 'cosmicWebDensity', item: entry.id },
    }),
  );
}
