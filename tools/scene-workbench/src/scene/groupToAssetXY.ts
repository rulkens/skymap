import type { Vec2 } from '../../../../src/@types/math/Vec2';
import { rotateVec3ByQuat } from '../../../../src/utils/math/rotateVec3ByQuat';
import type { SimilarityTransform } from '../../@types/SimilarityTransform';

/** Group-frame XY metres to asset-local XY: the inverse of `assetToGroupM`. Only valid when
 *  `isZOnlyRotation` holds — a tilt would mix the unknown Z into the result. */
export function groupToAssetXY(transform: SimilarityTransform, xyM: Vec2): Vec2 {
  const { scale, rotation, translationM } = transform;
  const conjugate = [-rotation[0], -rotation[1], -rotation[2], rotation[3]] as const;
  const r = rotateVec3ByQuat(conjugate, [xyM[0] - translationM[0], xyM[1] - translationM[1], 0]);
  return [r[0] / scale, r[1] / scale];
}
