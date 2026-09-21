/**
 * aerialPerspectiveCompute — core's `aerial-perspective` row, delegating to
 * `encodeAtmosphereAerialPerspective` unchanged (bare delegation, mirrors
 * `skyViewCompute`).
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import { encodeAtmosphereAerialPerspective } from '../encodeAtmosphereAerialPerspective';

export const aerialPerspectiveCompute: ContentCompute = {
  name: 'aerial-perspective',
  encode: encodeAtmosphereAerialPerspective,
};
