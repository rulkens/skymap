import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { rotateVec3ByQuat } from '../../../../src/utils/math/rotateVec3ByQuat';
import type { SimilarityTransform } from '../../@types/SimilarityTransform';

/** Asset-local metres to group-frame metres: scale, then rotate, then translate. */
export function assetToGroupM(transform: SimilarityTransform, pM: Vec3): Vec3 {
  const { scale, rotation, translationM } = transform;
  const r = rotateVec3ByQuat(rotation, [pM[0] * scale, pM[1] * scale, pM[2] * scale]);
  return [r[0] + translationM[0], r[1] + translationM[1], r[2] + translationM[2]];
}
