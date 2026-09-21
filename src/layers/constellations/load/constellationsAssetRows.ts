/**
 * The Layer's one asset row — demand + request only; the `factory` hands back
 * the slot `create` already minted, so core folds this over its own rows
 * (Ruling 10) without ever building one.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { ConstellationsRuntime } from '../@types/ConstellationsRuntime';

export function constellationsAssetRows(runtime: ConstellationsRuntime): readonly AssetWiringRow[] {
  return [
    {
      key: 'constellations',
      factory: () => runtime.slot,
      req: () => undefined,
      demand: (ctx) => ctx.settings.constellations.enabled,
      priority: 31, // small JSON on the near-sky rung, right behind the marker catalog
    },
  ];
}
