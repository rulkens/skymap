/**
 * stellarStreamsPass — additive stream debris on NEAR0, right after `local-bubble`: like the
 * shell, it lands after the Milky Way's dust multiply, so halo streams in front of the disc are
 * not darkened by it. Core hands the fade; both looks come from settings. Only the sharp streak
 * look stamps picks: the haze is wide and faint, and would take clicks far off the stream.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';

export function stellarStreamsPass(runtime: StellarStreamsRuntime): ContentPass<'stellarStreams'> {
  // Wrapped on a multiple of the shader's 8 s loop, so f32 never loses the phase.
  const clockSec = (ctx: FrameView): number => (ctx.snapshot.nowMs / 1000) % 200;
  return {
    name: 'stellar-streams',
    fade: 'stellarStreams',

    enabled() {
      return runtime.renderer.hasData();
    },

    draw(pass, view, ctx, state, fade) {
      const { streak, haze } = state.settings.stellarStreams;
      runtime.renderer.draw(
        pass,
        narrowMat4(rebaseViewProj(view.slab.vp, view.camPos)),
        view.viewportPx,
        ctx.drawPxPerRad,
        view.camPos,
        clockSec(ctx),
        [streak, haze],
        fade,
      );
    },

    pickEnabled(_state, _ctx, _view, fade) {
      return runtime.renderer.hasData() && fade > 0;
    },

    // The same windowed `vp`/`viewportPx` and clock as `draw`, so the stamp lands under the streak.
    drawPick(pass, view, ctx, state) {
      runtime.renderer.drawPick(
        pass,
        narrowMat4(rebaseViewProj(view.slab.vp, view.camPos)),
        view.viewportPx,
        ctx.drawPxPerRad,
        view.camPos,
        clockSec(ctx),
        state.settings.stellarStreams.streak,
      );
    },
  };
}
