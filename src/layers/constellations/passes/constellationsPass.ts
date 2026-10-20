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
import { CONSTELLATION_LINE_HALFWIDTH_PX } from '../../../data/constellation/constellationLineHalfwidthPx';
import { CONSTELLATION_LINE_COLOR } from '../../../data/constellation/constellationLineColor';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../services/engine/presentation/emphasisOf';
import { constellationsVisibility } from '../visibility';

export function constellationsPass(runtime: ConstellationsRuntime): ContentPass<'constellations'> {
  const entry = visibilityEntryOf(constellationsVisibility, 'constellations');
  return {
    name: 'constellations',
    fade: 'constellations',
    enabled: () => true,

    draw(pass, view, ctx, state, fade) {
      // `constellationsSlot`'s commit owns the upload; this pass never uploads.
      if (!runtime.renderer.hasData()) return;

      // view.camPos, NOT ctx.drawCamPos, for the f64 rebase below — the
      // renderer writes endpoints camera-relative to THIS pose (the
      // starPointsPass seam).
      const camPos = view.camPos;
      const layerOpacity = fade * emphasisOf(entry, ctx.snapshot);

      // Multiplying absolute parsec-scale endpoints by an f32 vp cancels catastrophically
      // on approach and makes the lines hop, so fold the eye offset in at f64 — from the
      // slab's f64 `vp`, NOT the already-narrowed `view.vp` — and pair it with the
      // camera-relative endpoints the renderer writes per frame (the starPointsPass seam).
      const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));

      runtime.renderer.draw(
        pass,
        rebasedVp,
        view.viewportPx,
        ctx.drawPxPerRad,
        CONSTELLATION_LINE_HALFWIDTH_PX,
        state.settings.constellations.intensity,
        layerOpacity,
        camPos,
        CONSTELLATION_LINE_COLOR,
      );
    },
  };
}
