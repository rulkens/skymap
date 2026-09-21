/**
 * constellationsPass — the 88 classical asterisms as additive lines between
 * their real member stars, so flying away shears the figures apart. Endpoints
 * sit at parsec-to-kiloparsec scale, which COSMO's fixed 0.01 Mpc near plane
 * would clip, so this row projects through NEAR0 instead, still on the HDR tone-map.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ConstellationsRuntime } from '../@types/ConstellationsRuntime';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { constellationsBand } from '../present/constellationsBand';
import { constellationsFade } from '../present/constellationsFade';
import { CONSTELLATION_LINE_HALFWIDTH_PX } from '../../../data/constellation/constellationLineHalfwidthPx';
import { CONSTELLATION_LINE_COLOR } from '../../../data/constellation/constellationLineColor';

export function constellationsPass(runtime: ConstellationsRuntime): ContentPass {
  return {
    name: 'constellations',

    enabled(state, ctx, _view) {
      // Toggle-independent hard cull — see `constellationsBand`; a zero band
      // also empties the (hdr, NEAR0) step for this row.
      if (constellationsBand(ctx) === 0) return false;
      if (state.settings.constellations.enabled) return true;
      return state.subsystems.fades.opacityOf({ kind: 'constellations' }, ctx.nowMs) > 0;
    },

    draw(pass, view, ctx, state) {
      // `constellationsSlot`'s commit owns the upload; this pass never uploads.
      if (!runtime.renderer.hasData()) return;

      // view.camPos, NOT ctx.drawCamPos, for the f64 rebase below — the
      // renderer writes endpoints camera-relative to THIS pose (the
      // starPointsPass seam); `constellationsFade` reads ctx separately.
      const camPos = view.camPos;
      const layerOpacity = constellationsFade(state, ctx);

      // Multiplying absolute parsec-scale endpoints by an f32 vp cancels catastrophically
      // on approach and makes the lines hop, so fold the eye offset in at f64 — from the
      // slab's f64 `vp`, NOT the already-narrowed `view.vp` — and pair it with the
      // camera-relative endpoints the renderer writes per frame (the starPointsPass seam).
      const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));

      runtime.renderer.draw(
        pass,
        rebasedVp,
        view.viewportPx,
        CONSTELLATION_LINE_HALFWIDTH_PX,
        state.settings.constellations.intensity,
        layerOpacity,
        camPos,
        CONSTELLATION_LINE_COLOR,
      );
    },
  };
}
