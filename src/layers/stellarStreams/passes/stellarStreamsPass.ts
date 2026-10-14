/**
 * stellarStreamsPass — PROTOTYPE. Additive stream debris on NEAR0, right after
 * `local-bubble`: like the shell, it lands after the Milky Way's dust multiply,
 * so halo streams in front of the disc are not darkened by it.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StellarStreamsRuntime } from '../@types/StellarStreamsRuntime';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { STELLAR_STREAMS_LOOKS } from '../../../data/stellarStreams/stellarStreamsLooks';

export function stellarStreamsPass(runtime: StellarStreamsRuntime): ContentPass {
  return {
    name: 'stellar-streams',

    enabled() {
      return runtime.renderer.hasData();
    },

    draw(pass, view, ctx) {
      runtime.renderer.draw(
        pass,
        narrowMat4(rebaseViewProj(view.slab.vp, view.camPos)),
        view.viewportPx,
        ctx.drawPxPerRad,
        view.camPos,
        ctx.snapshot.nowMs / 1000,
        (globalThis as { __streamLooks?: typeof STELLAR_STREAMS_LOOKS }).__streamLooks ??
          STELLAR_STREAMS_LOOKS,
      );
    },
  };
}
