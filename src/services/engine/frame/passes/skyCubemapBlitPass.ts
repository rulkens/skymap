/**
 * skyCubemapBlitPass — the once-baked solar-system sky laid under a probe
 * capture: the first draw on a probe face's COSMO step, so the host body is
 * stamped over a star field rather than over black. Capture-only: no render
 * line rosters it (`checkFrameOrder` allows exactly that).
 *
 * Gated on the sky row's band at the FACE's eye, as the lens is on its own
 * row's: `PassState` carries no capture runtime, and the band is what
 * allocates and bakes the row (`scheduleSkyCaptures`), so outside it the probe
 * captures no sky rather than sampling a released texture.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { CUBEMAP_CAPTURES } from '../../../../data/rendering/cubemapCaptures';
import { skyCaptureBandAlpha } from '../skyCaptureBandAlpha';

export const skyCubemapBlitPass: ContentPass = {
  name: 'sky-cubemap-blit',

  enabled(state, ctx) {
    if (state.gpu.cubeFaceBlitRenderer === null) return false;
    return skyCaptureBandAlpha('solarSystem', state, ctx) > 0;
  },

  draw(pass, _view, ctx, state) {
    const renderer = state.gpu.cubeFaceBlitRenderer;
    if (renderer === null) return;
    // A face ctx always carries the basis `cubemapFaceContext` built it with
    // (columns right, up, back); the real camera's is optional on the type.
    const basis = ctx.cam.poseBasis;
    if (basis === undefined) {
      throw new Error('skyCubemapBlitPass: the face context carries no poseBasis');
    }
    renderer.draw(pass, basis, ctx.renderTargets.cubeViewOf(CUBEMAP_CAPTURES.solarSystem.target));
  },
};
