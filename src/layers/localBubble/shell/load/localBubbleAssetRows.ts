/**
 * The Layer's one asset row, gated on the shell band's two edges so the ~11 MB `.shell` file
 * stays off the boot path until the camera nears the bubble's wall, and is freed again once the
 * view is far past it. From inside the bubble nothing draws, so Earth does not load it.
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
      demand: { near: { band: 'shell', edge: 'both', lead: 2, release: 4 } },
      priority: 83, // next free rung after filaments (80) / flow (81) / the volume overlays (82)
      gates: 'localBubble',
    },
  ];
}
