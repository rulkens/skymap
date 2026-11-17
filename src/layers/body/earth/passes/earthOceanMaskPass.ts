/**
 * earthOceanMaskPass: the globe's land map for the antique look, drawn into the
 * look's `antique-land` row on Earth's `surfaceMask` line. The look takes its
 * coasts from this, not from the lit colour (clouds and sunglint read as land
 * there, limb haze as sea). Listed in `ANTIQUE_ONLY_PASSES`, so it never draws
 * with the look off. Not depth-tested: a body passing in front of Earth takes
 * Earth's land map where it covers it.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { viewFlipsWinding } from '../../../../utils/camera/viewRig/viewFlipsWinding';
import { earthSurfaceUniforms } from '../present/earthSurfaceUniforms';

export function earthOceanMaskPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'earth-ocean-mask',

    enabled(_state, _ctx, view) {
      return view.slab.frame.kind === 'body-m' && view.slab.frame.hostId === 'earth';
    },

    draw(pass, view, ctx, state) {
      const uniforms = earthSurfaceUniforms(state, ctx, view);
      if (uniforms === null) return;
      runtime.earthRenderer.drawOceanMask(pass, uniforms, viewFlipsWinding(ctx));
    },
  };
}
