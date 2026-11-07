/**
 * texturedBodiesPass: the `textured` branch of the body partition, a resolved
 * resident-texture body drawn as a lit surface-mapped sphere, one `'body'`-slab row
 * per body. Its sibling `planetsPass` takes the `flat` branch, so a body is
 * textured XOR flat and the two opaque layers cannot z-fight; a body whose texture
 * has not landed is `flat`. Ring ratios and Minnaert limb params are DATA on the
 * uniform (`ringOuterRatio == 0` and `strength 0` are the identities), composed in
 * `texturedBodyUniforms`. No pick aspect: `planetsPass` is the sole pick site for
 * flat and textured. Pose: `ctx.bodyPose`, the closure `deriveSlabs` built the vp from.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { bodySceneBodyPartition } from '../../slabs/present/bodySceneBodyPartition';
import { texturedBodyUniforms } from '../present/texturedBodyUniforms';

export function texturedBodiesPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'textured-bodies',

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      const bodyId = view.slab.frame.hostId;
      return bodySceneBodyPartition(state, ctx, runtime).textured.some((b) => b.id === bodyId);
    },

    draw(pass, view, ctx, state) {
      const record = texturedBodyUniforms(state, ctx, view, runtime);
      if (record === null) return;
      runtime.texturedBodyRenderer.draw(pass, record.bodyId, record.uniforms);
    },
  };
}
