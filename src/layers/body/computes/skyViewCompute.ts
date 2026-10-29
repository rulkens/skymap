/**
 * skyViewCompute — the body Layer's `sky-view` row. Its first statement resizes the
 * sky-view LUT to the data tier, before any gate: this row is the frame's first reader
 * of the LUT, so a tier change lands before the bake writes it and the shell samples it.
 */

import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { BodyRuntime } from '../@types/BodyRuntime';
import { encodeAtmosphereSkyView } from '../render/encodeAtmosphereSkyView';
import { SKY_VIEW_LUT_SIZE_BY_TIER } from '../present/skyViewLutSizeByTier';

export function skyViewCompute(runtime: BodyRuntime): ContentCompute {
  return {
    name: 'sky-view',
    scope: 'once',
    encode(encoder, ctx, state, claimTimestampWrites) {
      runtime.atmosphereShellRenderer.reconcile({
        skyViewLutSize: SKY_VIEW_LUT_SIZE_BY_TIER[state.tier],
      });
      encodeAtmosphereSkyView(
        runtime.atmosphereShellRenderer,
        encoder,
        ctx,
        state,
        claimTimestampWrites,
      );
    },
  };
}
