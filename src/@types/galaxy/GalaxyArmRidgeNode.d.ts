/**
 * GalaxyArmRidgeNode — one sample of the shared arm-ridge walk
 * (`sampleArmRidgeNodes.ts`): a uniform log-radius step along
 * `armRidgeCurvePoint`, its arc spacing to the next node, its own
 * orthonormal frame, and its UN-normalized fade*clump*survival modulation.
 * Both `pushArmRidges` and the young-star chain producer consume it.
 */
import type { Vec3 } from '../math/Vec3';

export type GalaxyArmRidgeNode = {
  readonly logR: number;
  readonly radius: number;
  readonly center: Vec3;
  /** Arc distance to the next node (backward diff at the open end). */
  readonly spacing: number;
  readonly frame: { readonly along: Vec3; readonly across: Vec3; readonly pole: Vec3 };
  /** fade * clump * survival, UN-normalized — consumers normalize. */
  readonly mod: number;
};
