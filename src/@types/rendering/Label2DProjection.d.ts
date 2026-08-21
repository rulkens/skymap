import type { Vec2 } from '../math/Vec2';

/**
 * One director instance's per-frame placement basis — a `Label2DDirectorConfig.project`
 * result. `vp` carries whatever precision the owning slab uses (NEAR0 will resolve
 * f64); `vpF32` is the same matrix narrowed for the renderer's GPU upload, which is
 * always f32.
 */
export type Label2DProjection = {
  /** Placement matrix — f64 where the slab has one (NEAR0). */
  readonly vp: Float32Array | Float64Array;
  /** The same matrix narrowed for the renderer upload. */
  readonly vpF32: Float32Array;
  readonly viewportPx: Vec2;
};
