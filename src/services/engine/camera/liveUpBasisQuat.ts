/**
 * liveUpBasisQuat — the live up-basis B(t) as a unit quaternion
 * (x, y, z, w).
 *
 * `upBasis.current` is the tight 9-float column-major Mat3 `runFrame`
 * resolves once per frame — exactly `matrixToQuaternion`'s input — so both
 * switch surfaces (the orientation saga's runtime accessor in `engine.ts` and
 * the `frameTo` clip cue in `applySceneEffect`) seed a roll from the live pole
 * rather than snapping to the committed frame. One conversion, one convention.
 */

import type { CameraRuntime } from '../../../@types/engine/state/CameraRuntime';
import type { Vec4 } from '../../../@types/math/Vec4';
import { matrixToQuaternion } from '../../../utils/math/matrixToQuaternion';

export function liveUpBasisQuat(cameraRuntime: CameraRuntime): Vec4 {
  return matrixToQuaternion(cameraRuntime.upBasis.current);
}
