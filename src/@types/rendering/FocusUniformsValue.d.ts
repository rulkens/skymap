import type { Vec3 } from '../math/Vec3';

/**
 * FocusUniformsValue — CPU mirror of the 32-byte FocusUniforms block
 * (see src/services/gpu/shaders/lib/focusUniforms.wesl for the WGSL
 * byte layout). Produced each frame by structureFocusSubsystem and packed
 * into the points pipeline's singleton focus buffer.
 *
 * At rest (no structure focused) every field is zero — `blend: 0` makes the
 * shader's per-vertex multiplier collapse to 1.0, so center/radius are
 * don't-cares.
 */
export type FocusUniformsValue = {
  /** Focused structure world-space centre in Mpc. `Readonly` because Vec3 is mutable. */
  readonly center: Readonly<Vec3>;
  /**
   * Apparent (outer) radius in Mpc = `apparentRadiusMpc ?? physicalRadiusMpc`
   * on the focused structure. The smoothstep edge where the fade reaches full recede (0.08).
   */
  readonly apparentRadiusMpc: number;
  /**
   * Physical (core) radius in Mpc — the structure's `physicalRadiusMpc`. The
   * smoothstep edge inside which galaxies stay fully bright. The shader caps
   * the effective inner edge below the apparent radius, so the band is never
   * degenerate even when the two radii are equal (superclusters / voids).
   */
  readonly physicalRadiusMpc: number;
  /** 0..1 smoothstep amount. 0 = no focus active. */
  readonly blend: number;
};
