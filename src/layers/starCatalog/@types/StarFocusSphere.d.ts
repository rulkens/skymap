import type { Vec3 } from '../../../@types/math/Vec3';

/**
 * The focus sphere in the star shader's own space: camera-relative Mpc, so the
 * f32 upload carries no large-minus-large cancellation. The camera is the cut's
 * origin (`StarCutSpec.originMpc`), the same one every node origin is
 * rebased against. Packed into `StarUniforms` by `writeStarFocus`.
 */
export type StarFocusSphere = {
  readonly centerRelCamMpc: Readonly<Vec3>;
  readonly apparentRadiusMpc: number;
  readonly physicalRadiusMpc: number;
  /** 0 = no focus; the shader's multiplier is then exactly 1. */
  readonly blend: number;
};
