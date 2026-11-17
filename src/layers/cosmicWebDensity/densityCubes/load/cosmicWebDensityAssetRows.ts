/**
 * The Layer's asset rows, one per source row, keyed by its id. Switching a
 * cube off releases it, and the slot's `onRelease` frees its GPU textures.
 */

import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { CosmicWebDensityAssetKey } from '../../@types/CosmicWebDensityAssetKey';
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';
import type { CosmicWebDensityRuntime } from '../../@types/CosmicWebDensityRuntime';

import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../sources/cosmicWebDensitySourceRows';

const PRIORITY: Record<CosmicWebDensityFieldId, number> = {
  mcpm: 70, // the largest single boot payload, and it only reads at the widest rung
  'polyphorm-2mrs': 82, // default-off, so it rarely competes at boot
  'mcpm-workbench': 82,
};

export function cosmicWebDensityAssetRows(
  runtime: CosmicWebDensityRuntime,
): readonly AssetWiringRow<unknown, unknown, CosmicWebDensityAssetKey>[] {
  return COSMIC_WEB_DENSITY_SOURCE_ROWS.map(
    (entry): AssetWiringRow<unknown, unknown, CosmicWebDensityAssetKey> => ({
      key: entry.id,
      slot: runtime.slots[entry.id],
      // An untiered row carries no `tier`, so a tier flip leaves its request
      // unchanged and the demand loop never reloads it.
      req: (tier) =>
        entry.tiered
          ? { binBaseName: entry.binBaseName, tier }
          : { binBaseName: entry.binBaseName },
      demand: { near: { band: 'deepZoom', edge: 'in', lead: 10, release: 100 } },
      priority: PRIORITY[entry.id],
      gates: { address: 'cosmicWebDensity', item: entry.id },
    }),
  );
}
