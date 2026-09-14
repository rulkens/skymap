import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../src/@types/math/Vec4';

/** An asset's placement within its group's metre frame. */
export type SimilarityTransform = {
  /** Metres, in the group frame. */
  readonly translationM: Vec3;
  /** Group frame ← asset frame, unit quaternion `[x, y, z, w]`. */
  readonly rotation: Vec4;
  /** Uniform. Non-uniform scale would break the covariance transport in the splat renderer. */
  readonly scale: number;
};
