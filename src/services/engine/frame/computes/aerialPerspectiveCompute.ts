/**
 * aerialPerspectiveCompute — core's `aerial-perspective` row, delegating to
 * `encodeAtmosphereAerialPerspective` unchanged (bare delegation, mirrors
 * `skyViewCompute`). `scope: 'perView'`: the froxel volume and shell uniform
 * stay one per body (`aerialPerspectiveRenderer.ts`), but each perView view
 * is its own submit, so view N's bake lands before view N's apply and after
 * view N−1's — mono's one view keeps today's single bake-then-apply order.
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import { encodeAtmosphereAerialPerspective } from '../encodeAtmosphereAerialPerspective';

export const aerialPerspectiveCompute: ContentCompute = {
  name: 'aerial-perspective',
  scope: 'perView',
  encode: encodeAtmosphereAerialPerspective,
};
