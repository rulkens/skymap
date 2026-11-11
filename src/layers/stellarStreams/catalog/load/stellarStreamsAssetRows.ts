/**
 * The Layer's two asset rows. The meta is tiny and read before the bin arrives (search, labels,
 * deep links), so it is always wanted; the bin loads a little beyond the streams band's out edge
 * and is released at twice it, so the ~5 MB file stays off the boot path.
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
      demand: 'always',
      priority: 32, // a small JSON wanted early, right behind the constellations (31)
    },
    {
      key: 'stellarStreams',
      slot: runtime.slot,
      req: () => undefined,
      demand: { near: { band: 'streams', edge: 'out', lead: 1.2, release: 2 } },
      priority: 85, // next free rung after satellites (84)
      gates: 'stellarStreams',
    },
  ];
}
