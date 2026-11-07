/**
 * stellarStreamsPass — the streak look, additive on NEAR0 right after `local-bubble`: like the
 * shell, it lands after the Milky Way's dust multiply, so halo streams in front of the disc are
 * not darkened by it. Core hands the fade; a focus recedes every stream but its own. The haze
 * look draws at half res in `stellarStreamsHazePass`. The pick stamps static centreline ribbons
 * under the same gate, only the focused stream's while one is focused.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { stellarStreamsClockSec } from '../present/stellarStreamsClockSec';
import { stellarStreamsLookLive } from '../present/stellarStreamsLookLive';
import { stellarStreamsFocus } from '../present/stellarStreamsFocus';

export function stellarStreamsPass(runtime: StellarStreamsRuntime): ContentPass<'stellarStreams'> {
  return {
    name: 'stellar-streams',
    fade: 'stellarStreams',

    enabled(state) {
      return stellarStreamsLookLive(runtime, state.settings.stellarStreams.streak);
    },

    draw(pass, view, ctx, state, fade) {
      runtime.renderer.draw(
        pass,
        'streak',
        narrowMat4(rebaseViewProj(view.slab.vp, view.camPos)),
        view.viewportPx,
        ctx.drawPxPerRad,
        view.camPos,
        stellarStreamsClockSec(ctx),
        state.settings.stellarStreams.streak,
        fade,
        stellarStreamsFocus(ctx, runtime.pickCode),
      );
    },

    // The same windowed `vp`/`viewportPx` as `draw`, so the ribbon lands under the streaks.
    drawPick(pass, view, ctx) {
      runtime.ribbonPick.draw(
        pass,
        narrowMat4(rebaseViewProj(view.slab.vp, view.camPos)),
        view.viewportPx,
        ctx.drawPxPerRad,
        view.camPos,
        stellarStreamsFocus(ctx, runtime.pickCode).focusedStream,
      );
    },
  };
}
