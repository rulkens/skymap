/** The Layer's one asset row: demand + request only; `slot` comes from the runtime. */

import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { CosmicWebFilamentsAssetKey } from '../../@types/CosmicWebFilamentsAssetKey';
import type { CosmicWebFilamentsRuntime } from '../../@types/CosmicWebFilamentsRuntime';

export function filamentsAssetRows(
  runtime: CosmicWebFilamentsRuntime,
): readonly AssetWiringRow<unknown, unknown, CosmicWebFilamentsAssetKey>[] {
  return [
    {
      key: 'filaments',
      slot: runtime.slot,
      req: (tier) => ({ small: tier === 'small' }),
      demand: { near: { band: 'deepZoom', edge: 'in', lead: 10, release: 100 } },
      priority: 80, // cosmic-web overlays sit behind the catalogs they are drawn over
      gates: 'cosmicWebFilaments',
    },
  ];
}
