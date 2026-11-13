/**
 * earthPass: Earth's `'body'`-slab content row, the base globe in `foreground:0`;
 * the detail patches over it are `surfaceTilesPass`. Earth's `body-m` row is itself
 * the visibility gate (culled at sub-pixel, absent past the foreground band), so
 * `enabled` checks only the host id. `earthRenderer.draw` writes ONE non-dynamic
 * uniform buffer, so draw at most once per frame. The globe is ALWAYS drawn, at the
 * datum's inner bound, so it cannot occlude relief and covers ground no resident
 * patch does yet.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { bodySlabFlooredPick } from '../../../../services/engine/helpers/bodySlabFlooredPick';
import { prepareBodySurfaceFrame } from '../../slabs/present/prepareBodySurfaceFrame';
import { viewFlipsWinding } from '../../../../utils/camera/viewRig/viewFlipsWinding';
import { earthSurfaceUniforms } from '../present/earthSurfaceUniforms';

export function earthPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'earth',

    enabled(_state, _ctx, view) {
      return view.slab.frame.kind === 'body-m' && view.slab.frame.hostId === 'earth';
    },

    draw(pass, view, ctx, state) {
      const uniforms = earthSurfaceUniforms(state, ctx, view);
      if (uniforms === null) return;
      runtime.earthRenderer.draw(pass, uniforms, viewFlipsWinding(ctx));
    },

    // Earth is the sole body of 'earth' (seed index 0); PICK_SENTINEL_OFFSET
    // keeps a real hit distinct from the cleared no-hit texel.
    drawPick(pass, view, ctx, state) {
      const pickRenderer = state.gpu.bodyPickRenderer;
      if (pickRenderer === null) return;

      const prepared = prepareBodySurfaceFrame(state, ctx, view);
      if (prepared === null) return;
      const { pose, radiusM } = prepared;

      const { mvp, camPosLocal } = bodySlabFlooredPick(
        view.slab.vp,
        pose.eyeRelBodyM,
        radiusM,
        ctx.drawPxPerRad,
      );

      pickRenderer.drawSphere(pass, {
        mvp,
        camPosLocal,
        packedId: packSelection(
          runtime.pickCodes.pickCodeOf('earth'),
          0 + PICK_SENTINEL_OFFSET,
        ),
      });
    },
  };
}
