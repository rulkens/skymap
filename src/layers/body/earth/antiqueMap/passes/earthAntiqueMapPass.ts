/**
 * earthAntiqueMapPass: the antique look's c.1690 geography on Earth — realm
 * colour codes, borders, rivers, signs — drawn into the look's geography row on
 * Earth's `surfaceMask` line. Listed in `ANTIQUE_ONLY_PASSES`, so with the look
 * off it never draws and its map file is never fetched.
 */

import type { ContentPass } from '../../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../../@types/BodyRuntime';
import { antiqueMapUniforms } from '../present/antiqueMapUniforms';

export function earthAntiqueMapPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'earth-antique-map',

    enabled(_state, _ctx, view) {
      return view.slab.frame.kind === 'body-m' && view.slab.frame.hostId === 'earth';
    },

    draw(pass, view, ctx, state) {
      const uniforms = antiqueMapUniforms(state, ctx, view);
      if (uniforms === null) return;
      runtime.antiqueMapRenderer.draw(pass, uniforms);
    },
  };
}
