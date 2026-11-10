/**
 * stellarStreamsHazePass — the haze look, into the half-res `stellar-streams-haze` target (why in
 * `stellarStreamsHazeTarget.ts`); `stellarStreamsHazeUpsamplePass` composites it into HDR just
 * before the streaks. Viewport and `pxPerRad` are the TARGET's, not the canvas's: the shader
 * sizes and floors each quad in pixels of the target it rasterises. Takes no picks.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { stellarStreamsClockSec } from '../present/stellarStreamsClockSec';
import { stellarStreamsLookLive } from '../present/stellarStreamsLookLive';
import { stellarStreamsFocus } from '../present/stellarStreamsFocus';

export function stellarStreamsHazePass(
  runtime: StellarStreamsRuntime,
): ContentPass<'stellarStreams'> {
  return {
    name: 'stellar-streams-haze',
    fade: 'stellarStreams',

    enabled(state) {
      return stellarStreamsLookLive(runtime, state.settings.stellarStreams.haze);
    },

    draw(pass, view, ctx, state, fade) {
      const { width: vw, height: vh } = ctx.snapshot.renderTargets.sizeOf('stellar-streams-haze');
      runtime.renderer.draw(
        pass,
        'haze',
        narrowMat4(rebaseViewProj(view.slab.vp, view.camPos)),
        [vw, vh],
        // The same frustum in fewer rows: the focal term scales with the target's height.
        ctx.drawPxPerRad * (vh / ctx.canvasSize.height),
        view.camPos,
        stellarStreamsClockSec(ctx),
        state.settings.stellarStreams.haze,
        fade,
        stellarStreamsFocus(ctx, runtime.pickCode, runtime.meta()),
      );
    },
  };
}
