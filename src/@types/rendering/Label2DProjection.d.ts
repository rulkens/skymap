import type { Vec2 } from '../math/Vec2';

/**
 * One director instance's per-frame placement basis — a `Label2DDirectorConfig.project`
 * result. `vp` carries whatever precision the owning slab uses (NEAR0 resolves
 * f64); `vpF32` is the same matrix narrowed for the renderer's GPU upload, which is
 * always f32.
 */
export type Label2DProjection = {
  /** Placement matrix, in Mpc clip units — f64 where the slab has one (NEAR0). */
  readonly vp: Float32Array | Float64Array;
  /**
   * The same matrix narrowed for the renderer upload. NEAR0's is additionally
   * rescaled to clip metres (`near0OverlayClip`) — NDC-identical to `vp`, but
   * NOT interchangeable with it for anything divided by `clip.w`.
   */
  readonly vpF32: Float32Array;
  readonly viewportPx: Vec2;
};
