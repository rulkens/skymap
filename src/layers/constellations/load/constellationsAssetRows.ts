/** The Layer's one asset row: demand + request only; `slot` comes from the runtime. */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { ConstellationsRuntime } from '../@types/ConstellationsRuntime';

export function constellationsAssetRows(runtime: ConstellationsRuntime): readonly AssetWiringRow[] {
  return [
    {
      key: 'constellations',
      slot: runtime.slot,
      req: () => undefined,
      demand: (ctx) => ctx.settings.constellations.enabled,
      priority: 31, // small JSON on the near-sky rung, right behind the marker catalog
      gates: 'constellations',
    },
  ];
}
