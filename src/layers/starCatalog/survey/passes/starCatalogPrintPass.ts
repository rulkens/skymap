/**
 * starCatalogPrintPass — the frame cut's LEAF stars as points in the antique
 * look's `antique-print-points` row, from the same lists `starCatalogPass` draws.
 * Listed in `ANTIQUE_ONLY_PASSES`, so it never draws with the look off. Rebased
 * about the cut's origin, as `drawStarCut`, so a print point lands on its star.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { starCatalogVisible } from '../../octreeCut/render/starCatalogVisible';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';

export function starCatalogPrintPass(runtime: StarCatalogRuntime): ContentPass<'starCatalog'> {
  return {
    name: 'star-catalog-print',
    fade: 'starCatalog',

    enabled: (_state, _ctx, _view, fade) => starCatalogVisible(runtime, fade),

    draw(pass, view) {
      const inputs = runtime.renderer.getFrameCut();
      if (inputs === null) return;
      const vp = narrowMat4(rebaseViewProj(view.slab.vp, inputs.cut.originMpc));
      for (const { source } of inputs.cut.sources) {
        runtime.starCatalogPrintRenderer.draw(pass, source, vp);
      }
    },
  };
}
