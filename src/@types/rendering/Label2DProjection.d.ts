import type { OutputProjection } from './OutputProjection';

/**
 * One director instance's per-frame placement basis — a `Label2DDirectorConfig.project`
 * result. Labels land through `output`; `viewFromSlab` carries this slab's label
 * anchors (absolute on COSMO, camera-relative on NEAR0) into its view space until
 * labels carry absolute hi/lo positions of their own.
 */
export type Label2DProjection = {
  readonly output: OutputProjection;
  /** Slab anchor → view space (+z ahead), column-major 4×4, f64 and unscaled. */
  readonly viewFromSlab: Float64Array;
  /**
   * View depth under which the slab's clip-space path near-clipped an anchor:
   * COSMO's near plane, 0 on NEAR0 (whose clip-z clamp never near-clipped).
   * The label shader keeps that cut so the projection swap changes no pixel.
   */
  readonly nearClipMpc: number;
};
