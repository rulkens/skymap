/**
 * aerialPerspectiveCompute — core's `aerial-perspective` row, delegating to
 * `encodeAtmosphereAerialPerspective` unchanged (bare delegation, mirrors
 * `skyViewCompute`). `scope: 'once'` until a later task moves the row to
 * `perView` (the froxel bake becomes per-view then, not here).
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import { encodeAtmosphereAerialPerspective } from '../encodeAtmosphereAerialPerspective';

export const aerialPerspectiveCompute: ContentCompute = {
  name: 'aerial-perspective',
  scope: 'once',
  encode: encodeAtmosphereAerialPerspective,
};
