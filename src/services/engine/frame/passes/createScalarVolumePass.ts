/**
 * createScalarVolumePass — shared factory behind a half-resolution
 * scalar-volume raymarch content pass: draws into `row.targetId`, gated by
 * `row.liveness` (see `ScalarVolumePassRow.d.ts`).
 *
 * ### Why the downscaled viewport (not the canvas viewport)
 *
 * `VolumeFieldRenderer.draw` takes `viewportPx` to normalise its per-fragment
 * jitter-dither spatial frequency. The target this pass draws into is
 * smaller than the canvas (`ctx.snapshot.renderTargets.sizeOf(row.targetId)`),
 * so passing the canvas size would shift the dither frequency and make it
 * appear finer on the upsampled output.
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
