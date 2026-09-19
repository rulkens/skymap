/**
 * The Layer's one asset row — demand + request only; the `factory` hands
 * back the slot `create` already minted. Distance-gated on the camera's
 * proximity to the Sun: the ~11 MB `.shell` file stays off the boot path
 * until the camera nears the solar neighbourhood.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { LocalBubbleRuntime } from '../types/LocalBubbleRuntime';

const DEMAND_DISTANCE_MPC = 0.02; // 20 kpc
const RELEASE_DISTANCE_MPC = 0.04; // 40 kpc

export function localBubbleAssetRows(runtime: LocalBubbleRuntime): readonly AssetWiringRow[] {
  return [
    {
      key: 'localBubble',
      factory: () => runtime.slot,
      req: () => undefined,
      demand: (ctx) =>
        ctx.settings.localBubble.enabled && Math.hypot(...ctx.cameraPosMpc) < DEMAND_DISTANCE_MPC,
      release: (ctx) => Math.hypot(...ctx.cameraPosMpc) > RELEASE_DISTANCE_MPC,
      priority: 83, // next free rung after filaments (80) / flow (81) / cf4Density et al. (82)
    },
  ];
}
