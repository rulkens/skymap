/**
 * moonReliefPass: the Moon's ground in the antique look's shared `antique-relief` row
 * (`fsMoonRelief`: the fall line, ground noise and hachure weight from the normal map),
 * on the Moon's `surfaceMask` line, so the plate engraves it as it engraves Mars's.
 * Listed in `ANTIQUE_ONLY_PASSES`, so it never draws with the look off.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { ANTIQUE_REFERENCE_HEIGHT_CSS } from '../../../../data/rendering/antiqueLook';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import { ANTIQUE_MOON_HOST, ANTIQUE_MOON_RELIEF_BYTES } from '../data/antiqueMoonPrint';
import { texturedBodyUniforms } from '../present/texturedBodyUniforms';

export function moonReliefPass(runtime: BodyRuntime): ContentPass {
  const radiusM = innerBoundRadiusM(
    SCENE_CELESTIAL_BODIES.find((b) => b.id === ANTIQUE_MOON_HOST)!.surface,
  );
  const record = new Float32Array(ANTIQUE_MOON_RELIEF_BYTES / 4);
  return {
    name: 'moon-relief',

    enabled(_state, _ctx, view) {
      return view.slab.frame.kind === 'body-m' && view.slab.frame.hostId === ANTIQUE_MOON_HOST;
    },

    draw(pass, view, ctx, state) {
      const uniforms = texturedBodyUniforms(state, ctx, view, runtime);
      if (uniforms === null) return;
      record[0] = ctx.canvasSize.height / ANTIQUE_REFERENCE_HEIGHT_CSS;
      record[1] = ctx.drawPxPerRad;
      record[2] = radiusM;
      runtime.texturedBodyRenderer.drawMoonRelief(
        pass,
        uniforms.bodyId,
        uniforms.uniforms,
        record.buffer,
      );
    },
  };
}
