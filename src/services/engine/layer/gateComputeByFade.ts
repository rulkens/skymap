/**
 * Core's gate for a compute that declares `fade`: hands it the handed value, distance band
 * included, as `encode`'s last argument. Never skips: what a 0 means is the compute's call.
 * A once-scope compute reads the band at the canvas view it is encoded with: every view's
 * eye is the frame camera's give or take an eye offset, far below any band's scale.
 */

import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { resolveViewFadeValue } from '../presentation/resolveViewFadeValue';

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
        resolveViewFadeValue(state, ctx, address),
      ),
  };
}
