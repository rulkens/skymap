/**
 * createScalarVolumePass — shared factory behind a half-resolution
 * scalar-volume raymarch content pass: draws into `row.targetId`, gated by
 * `row.liveness` (see `ScalarVolumePassRow.d.ts`). Passes the TARGET's size,
 * not the canvas's, as `viewportPx` — `VolumeFieldRenderer.draw` normalises
 * its per-fragment jitter-dither spatial frequency against it, and the
 * target is smaller than the canvas, so the canvas size would shift the
 * dither frequency finer on the upsampled output.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { ScalarVolumePassRow } from '../../../../@types/engine/frame/ScalarVolumePassRow';

export function createScalarVolumePass<Id extends string>(
  row: ScalarVolumePassRow<Id>,
): ContentPass {
  return {
    name: row.name,

    enabled(state, ctx, _view) {
      return row.liveness(state, ctx) !== null;
    },

    draw(pass, view, ctx, state) {
      const liveness = row.liveness(state, ctx);
      if (liveness === null) return;

      const { width: vw, height: vh } = ctx.snapshot.renderTargets.sizeOf(row.targetId);
      row.renderer.draw(
        pass,
        view.vp,
        [vw, vh],
        // A target spanning the same frustum in fewer rows scales the focal
        // term with its height (as `drawStarStream` does for its half-res row).
        ctx.drawPxPerRad * (vh / ctx.canvasSize.height),
        view.camPos,
        liveness.settingsOf,
        liveness.fadeOpacityOf,
      );
    },
  };
}
