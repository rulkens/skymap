/** The Layer's one asset row: demand + request only; `slot` comes from the runtime. */

import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { ConstellationsAssetKey } from '../../@types/ConstellationsAssetKey';
import type { ConstellationsRuntime } from '../../@types/ConstellationsRuntime';

export function constellationsAssetRows(
  runtime: ConstellationsRuntime,
): readonly AssetWiringRow<unknown, unknown, ConstellationsAssetKey>[] {
  return [
    {
      key: 'constellations',
      slot: runtime.slot,
      req: () => undefined,
      demand: {},
      priority: 31, // small JSON on the near-sky rung, right behind the marker catalog
      gates: 'constellations',
    },
  ];
}
