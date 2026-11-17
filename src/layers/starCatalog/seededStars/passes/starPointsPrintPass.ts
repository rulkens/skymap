/**
 * starPointsPrintPass — the unresolved seeded stars (the ones `starPointsPass`
 * draws) as points in the antique look's `antique-print-points` row, each fading
 * as it does there. Listed in `ANTIQUE_ONLY_PASSES`, so it never draws with the
 * look off. Rebased about the eye in f64 before narrowing, as `starPointsPass`.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import type { PrintStar } from '../@types/PrintStar';
import { sceneBodyPresentation } from '../../../../services/engine/frame/sceneBodyPresentation';
import { positionedSeededStars } from '../present/positionedSeededStars';
import { SEEDED_STAR_REFS } from '../present/seededStarRefs';
import { seededStarsHandedZero } from '../present/seededStarsHandedZero';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { focusAlphaMultiplier } from '../../../../utils/structure/focusAlphaMultiplier';

export function starPointsPrintPass(runtime: StarCatalogRuntime): ContentPass<'starCatalog'> {
  return {
    name: 'star-points-print',
    fade: 'starCatalog',

    enabled: (_state, _ctx, _view, fade) => !seededStarsHandedZero(fade),

    draw(pass, view, ctx, _state, catalogFade) {
      const camPos = view.camPos;
      const stars = positionedSeededStars(sceneBodyPresentation(ctx).unresolved).map(
        ({ id, positionMpc, absMag }): PrintStar => ({
          posRelCamMpc: [
            positionMpc[0] - camPos[0],
            positionMpc[1] - camPos[1],
            positionMpc[2] - camPos[2],
          ],
          absMag,
          fade:
            focusAlphaMultiplier(positionMpc, ctx.snapshot.focus) *
            catalogFade[SEEDED_STAR_REFS.get(id)!.item],
        }),
      );
      runtime.starPointPrintRenderer.draw(
        pass,
        narrowMat4(rebaseViewProj(view.slab.vp, camPos)),
        stars,
      );
    },
  };
}
