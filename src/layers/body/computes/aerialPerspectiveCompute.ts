/**
 * aerialPerspectiveCompute — the body Layer's `aerial-perspective` row, delegating to
 * `encodeAtmosphereAerialPerspective`. `scope: 'perView'`: the froxel volume and shell
 * uniform stay one per body (`aerialPerspectiveRenderer.ts`), but each perView view is
 * its own submit, so view N's bake lands before view N's apply and after view N−1's —
 * mono's one view keeps a single bake-then-apply order.
 */

import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { BodyRuntime } from '../@types/BodyRuntime';
import { encodeAtmosphereAerialPerspective } from '../render/encodeAtmosphereAerialPerspective';

export function aerialPerspectiveCompute(runtime: BodyRuntime): ContentCompute {
  return {
    name: 'aerial-perspective',
    scope: 'perView',
    encode: (encoder, ctx, state, claimTimestampWrites) =>
      encodeAtmosphereAerialPerspective(
        runtime.atmosphere,
        encoder,
        ctx,
        state,
        claimTimestampWrites,
      ),
  };
}
