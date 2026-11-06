/**
 * The Layer's one asset row, gated on the shell band's out edge (10 kpc from the Sun): it
 * loads inside 20 kpc and releases past 40 kpc, so the ~11 MB `.shell` file stays off the
 * boot path until the camera nears it. Only the out edge gates: loading from inside the
 * bubble is wanted.
 */

import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { LocalBubbleAssetKey } from '../../@types/LocalBubbleAssetKey';
import type { LocalBubbleRuntime } from '../../@types/LocalBubbleRuntime';

export function localBubbleAssetRows(
  runtime: LocalBubbleRuntime,
): readonly AssetWiringRow<unknown, unknown, LocalBubbleAssetKey>[] {
  return [
    {
      key: 'localBubble',
      slot: runtime.slot,
      req: () => undefined,
      demand: { near: { band: 'shell', edge: 'out', lead: 2, release: 4 } },
      priority: 83, // next free rung after filaments (80) / flow (81) / the volume overlays (82)
      gates: 'localBubble',
    },
  ];
}
