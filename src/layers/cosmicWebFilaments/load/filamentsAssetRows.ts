/**
 * The Layer's one asset row — demand + request only; the `factory` hands back
 * the slot `create` already minted, so core folds this over its own rows
 * (Ruling 10) without ever building one.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { FilamentsRuntime } from '../@types/FilamentsRuntime';

export function filamentsAssetRows(runtime: FilamentsRuntime): readonly AssetWiringRow[] {
  return [
    {
      key: 'filaments',
      factory: () => runtime.slot,
      req: (tier) => ({ small: tier === 'small' }),
      demand: (ctx) => ctx.settings.filaments.enabled,
      priority: 80, // cosmic-web overlays sit behind the catalogs they are drawn over
    },
  ];
}
