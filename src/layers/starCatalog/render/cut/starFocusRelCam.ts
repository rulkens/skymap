import type { Vec3 } from '../../../../@types/math/Vec3';
import type { FocusUniformsValue } from '../../../../@types/rendering/FocusUniformsValue';
import type { StarFocusSphere } from '../../@types/StarFocusSphere';

/**
 * Re-express the absolute focus sphere about the cut's origin, in f64 before
 * the f32 upload narrows it — the star shader works in camera-relative space,
 * where a parsec-scale sphere and a kiloparsec-scale camera offset would
 * otherwise cancel. At rest the radii stay `ZERO_FOCUS`'s non-degenerate pair
 * (the shader's smoothstep edges must never coincide) and `blend` is 0.
 */
export function starFocusRelCam(
  focus: FocusUniformsValue,
  originMpc: Readonly<Vec3>,
): StarFocusSphere {
  return {
    centerRelCamMpc: [
      focus.center[0] - originMpc[0],
      focus.center[1] - originMpc[1],
      focus.center[2] - originMpc[2],
    ],
    apparentRadiusMpc: focus.apparentRadiusMpc,
    physicalRadiusMpc: focus.physicalRadiusMpc,
    blend: focus.blend,
  };
}
