import type { LensSpec } from './LensSpec';
import type { LensMode } from '../settings/LensMode';

/**
 * LensingUniformsValue — CPU mirror of the 528-byte LensingUniforms block
 * (see `src/services/gpu/shaders/lib/lensingUniforms.wesl` for the WGSL
 * byte layout). Built once per frame in `renderFrame` and packed into the
 * single engine-owned lensing buffer, whose bind group is shared by the
 * points + pick pipelines (and, in a later phase, the volume raymarch).
 *
 * The lens data used to ride in the TAIL of the points `Uniforms` struct;
 * pulling it out into its own value + its own shared bind group lets a
 * second pipeline bind the same buffer without re-packing it, mirroring the
 * `FocusUniformsValue` / focus-uniform pattern.
 *
 * r_s is now PER-LENS (carried on each `LensSpec` as `rsMpc`), not a shared
 * profile knob. The header word previously used for the global scale radius
 * is retired to padding.
 *
 * At rest (`enabled: false`, no in-view lenses) the array is empty and the
 * shader's `count`-gated loop runs zero iterations, so `mode` becomes a
 * don't-care.
 */
export type LensingUniformsValue = {
  /** Master gravitational-lensing toggle. False short-circuits the vertex deflection at zero cost. */
  readonly enabled: boolean;
  /**
   * The in-view cluster lenses to apply this frame, each carrying eye-relative
   * geometry (`dirLens`, `dL`), Einstein angular radius (`thetaERad`), and NFW
   * scale radius (`rsMpc`). Capped at `MAX_LENSES` by the packer; empty when
   * lensing is off or no cluster sits in front of the camera. See
   * `lib/lensing.wesl` for the deflection model.
   */
  readonly lenses: readonly LensSpec[];
  /** Lensing profile applied to every in-view lens: SIS (constant deflection) or NFW (g(x)/x). */
  readonly mode: LensMode;
};
