/**
 * The Layer's two asset rows. The meta is tiny and read before the bin arrives (search, labels,
 * deep links), so it is always wanted; the bin loads while the switch is on and is released when
 * it goes off.
 */

import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { StellarStreamsAssetKey } from '../@types/StellarStreamsAssetKey';
import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';

export function stellarStreamsAssetRows(
  runtime: StellarStreamsRuntime,
): readonly AssetWiringRow<unknown, unknown, StellarStreamsAssetKey>[] {
  return [
    {
      key: 'stellarStreamsMeta',
      slot: runtime.metaSlot,
      req: () => undefined,
      demand: () => true,
      priority: 32, // a small JSON wanted early, right behind the constellations (31)
    },
    {
      key: 'stellarStreams',
      slot: runtime.slot,
      req: () => undefined,
      demand: (ctx) => ctx.settings.stellarStreams.enabled,
      release: (ctx) => !ctx.settings.stellarStreams.enabled,
      priority: 85, // next free rung after satellites (84)
      gates: 'stellarStreams',
    },
  ];
}
