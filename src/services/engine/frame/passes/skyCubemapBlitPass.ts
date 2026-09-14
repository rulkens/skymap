/**
 * skyCubemapBlitPass — the baked solar-system sky under a probe face, so the
 * host is stamped over stars rather than black. Capture-only (no render line
 * rosters it). Gated on the sky row's band at the FACE's eye: the band is what
 * allocates the row, so outside it the probe captures no sky rather than
 * sampling a released texture.
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
    // A face ctx always carries `cubemapFaceContext`'s basis; optional on the type.
    const basis = ctx.cam.poseBasis;
    if (basis === undefined) {
      throw new Error('skyCubemapBlitPass: the face context carries no poseBasis');
    }
    renderer.draw(pass, basis, ctx.renderTargets.cubeViewOf(CUBEMAP_CAPTURES.solarSystem.target));
  },
};
