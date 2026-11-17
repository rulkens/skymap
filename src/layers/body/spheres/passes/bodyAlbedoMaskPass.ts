/**
 * bodyAlbedoMaskPass: the antique look's albedo map for a textured body with an
 * `ANTIQUE_ALBEDO_MASK` row (Mars), drawn into the look's `antique-land` row on that
 * body's `surfaceMask` line beside Earth's ocean mask. The body's print module reads
 * it (`antiqueLook/bodies/`). Listed in `ANTIQUE_ONLY_PASSES`, so it never draws with
 * the look off. It draws inside the relief shell too: the engraved ground replaces the
 * markings' ink, but their red-lead wash carries on, so Mars keeps one colour at every range.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { ANTIQUE_ALBEDO_MASK } from '../../../../data/rendering/antiqueAlbedoMask';
import { texturedBodyUniforms } from '../present/texturedBodyUniforms';

export function bodyAlbedoMaskPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'body-albedo-mask',

    enabled(_state, _ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      const hostId = view.slab.frame.hostId;
      return hostId in ANTIQUE_ALBEDO_MASK;
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const albedoMid = ANTIQUE_ALBEDO_MASK[view.slab.frame.hostId]!;
      const record = texturedBodyUniforms(state, ctx, view, runtime, albedoMid);
      if (record === null) return;
      runtime.texturedBodyRenderer.drawAlbedoMask(pass, record.bodyId, record.uniforms);
    },
  };
}
