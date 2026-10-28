/**
 * aerialPerspectiveCompute — the `aerial-perspective` row. `scope: 'perView'`: the
 * froxel volume and shell uniform are one per body, but each view is its own submit,
 * so view N's bake lands before view N's apply and after view N−1's.
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
        runtime.atmosphereShellRenderer,
        encoder,
        ctx,
        state,
        claimTimestampWrites,
      ),
  };
}
