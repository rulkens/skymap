/**
 * createScalarVolumePass — shared factory behind a half-resolution
 * scalar-volume raymarch content pass: draws into `row.targetId`, gated by
 * `row.liveness` (see `ScalarVolumePassRow.d.ts`). Passes the TARGET's size,
 * not the canvas's, as `viewportPx` (and scales `pxPerRad` to it): the camera
 * prefix describes the target the fragments land in, which is smaller than
 * the canvas.
 */

import type { ShowKey } from '../../../../@types/animation/ShowKey';
import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { ScalarVolumePassRow } from '../../../../@types/engine/frame/ScalarVolumePassRow';

export function createScalarVolumePass<Id extends string, K extends ShowKey = ShowKey>(
  row: ScalarVolumePassRow<Id, K>,
): ContentPass<K> {
  const erased = row as ScalarVolumePassRow<Id>;
  // The cast bridges `K`'s conditional `fade`: the row's own `fade` and value carry over as-is.
  return {
    name: erased.name,
    fade: erased.fade,

    enabled(state, ctx, _view, fade) {
      return erased.liveness(state, ctx, fade) !== null;
    },

    draw(pass, view, ctx, state, fade) {
      const liveness = erased.liveness(state, ctx, fade);
      if (liveness === null) return;

      const { width: vw, height: vh } = ctx.snapshot.renderTargets.sizeOf(row.targetId);
      row.renderer.draw(
        pass,
        view.vp,
        [vw, vh],
        // A target spanning the same frustum in fewer rows scales the focal
        // term with its height (as `drawStarCut` does for its half-res row).
        ctx.drawPxPerRad * (vh / ctx.canvasSize.height),
        view.camPos,
        liveness.settingsOf,
        liveness.fadeOpacityOf,
        liveness.regionOf,
        erased.inputs(state, ctx),
      );
    },
  } as ContentPass as ContentPass<K>;
}
