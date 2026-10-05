/**
 * The Layer's asset rows, one per source row, keyed by its `Source` code. Every
 * cube is load-once: no `release`, since freeing one needs an `onRelease` that
 * calls `renderer.unload(id)` or its GPU textures leak on evict.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { CosmicWebDensityRuntime } from '../@types/CosmicWebDensityRuntime';

import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../sources/cosmicWebDensitySourceRows';

const PRIORITY: Record<CosmicWebDensityFieldId, number> = {
  mcpm: 70, // the largest single boot payload, and it only reads at the widest rung
  'polyphorm-2mrs': 82, // default-off, so it rarely competes at boot
  'mcpm-workbench': 82,
};

export function cosmicWebDensityAssetRows(
  runtime: CosmicWebDensityRuntime,
): readonly AssetWiringRow[] {
  return COSMIC_WEB_DENSITY_SOURCE_ROWS.map(
    ([code, entry]): AssetWiringRow => ({
      key: code,
      factory: () => runtime.slots[entry.id],
      // An untiered row carries no `tier`, so a tier flip leaves its request
      // unchanged and the demand loop never reloads it.
      req: (tier) =>
        entry.tiered
          ? { binBaseName: entry.binBaseName, tier }
          : { binBaseName: entry.binBaseName },
      demand: (ctx) => ctx.settings.cosmicWebDensity.items[entry.id].enabled,
      priority: PRIORITY[entry.id],
    }),
  );
}
