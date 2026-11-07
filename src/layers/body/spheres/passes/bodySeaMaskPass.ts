/**
 * bodySeaMaskPass: the antique look's land map for a textured body with an
 * `ANTIQUE_SEA_ALBEDO` row (Mars), drawn into the look's `antique-land`
 * row on that body's `surfaceMask` line beside Earth's ocean mask: its dark albedo
 * is sea, so the plate cuts coasts round Syrtis Major and its kin. Listed in
 * `ANTIQUE_ONLY_PASSES`, so it never draws with the look off.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { ANTIQUE_SEA_ALBEDO } from '../../../../data/rendering/antiqueSeaAlbedo';
import { texturedBodyUniforms } from '../present/texturedBodyUniforms';

export function bodySeaMaskPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'body-sea-mask',

    enabled(_state, _ctx, view) {
      return view.slab.frame.kind === 'body-m' && view.slab.frame.hostId in ANTIQUE_SEA_ALBEDO;
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const seaBelow = ANTIQUE_SEA_ALBEDO[view.slab.frame.hostId]!;
      const record = texturedBodyUniforms(state, ctx, view, runtime, seaBelow);
      if (record === null) return;
      runtime.texturedBodyRenderer.drawSeaMask(pass, record.bodyId, record.uniforms);
    },
  };
}
