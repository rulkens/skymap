import type { Vec3 } from '../math/Vec3';

/**
 * FocusUniformsValue — CPU mirror of the 32-byte FocusUniforms block
 * (see src/services/gpu/shaders/lib/focusUniforms.wesl for the WGSL
 * byte layout). Produced each frame by clusterFocusSubsystem and packed
 * into the points pipeline's singleton focus buffer.
 *
 * At rest (no POI focused) every field is zero — `blend: 0` makes the
 * shader's per-vertex multiplier collapse to 1.0, so center/radius are
 * don't-cares.
 */
export type FocusUniformsValue = {
  /** POI world-space centre in Mpc. `Readonly` because Vec3 is mutable. */
  readonly center: Readonly<Vec3>;
  /** Membership radius in Mpc = `apparentRadiusMpc ?? physicalRadiusMpc`. */
  readonly radiusMpc: number;
  /** 0..1 smoothstep amount. 0 = no focus active. */
  readonly blend: number;
};
