/**
 * Core's gate for a compute that declares `fade`: hands it the handed value as `encode`'s last
 * argument. Never skips: what a 0 means is the compute's call. `state` is the engine's own,
 * bound at wrap time, as in `gatePlannerByFade`.
 */

import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { resolveFadeValue } from '../presentation/resolveFadeValue';

export function gateComputeByFade(
  compute: ContentCompute,
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
): ContentCompute {
  const address = compute.fade;
  if (address === undefined) return compute;
  return {
    ...compute,
    encode: (encoder, ctx, s, claimTimestampWrites) =>
      compute.encode(
        encoder,
        ctx,
        s,
        claimTimestampWrites,
        resolveFadeValue(state, ctx.snapshot, address),
      ),
  };
}
