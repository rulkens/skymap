/**
 * ForegroundComposite — fullscreen pass that OVER-composites the
 * foreground offscreen colour texture onto the HDR target.
 *
 * ### Blend semantics — OVER, not additive
 *
 * Unlike 'volumeUpsample' (which uses additive blending
 * '{ srcFactor: "one", dstFactor: "one" }' because every galaxy/volume
 * renderer contributes additively to HDR), this pass composites an
 * opaque-geometry result that already has correct opaque-geometry colour
 * and alpha coverage.  The OVER operator preserves background colour under
 * transparent foreground pixels and fully replaces it under opaque ones.
 *
 * Blend state:
 *   color: { srcFactor: 'src-alpha',         dstFactor: 'one-minus-src-alpha', operation: 'add' }
 *   alpha: { srcFactor: 'one',               dstFactor: 'one-minus-src-alpha', operation: 'add' }
 *
 * This is straight-alpha (unassociated) OVER composition.  The fragment
 * shader emits the foreground colour straight (not premultiplied by
 * alpha) because the blend hardware multiplies by 'src-alpha' on its own.
 * See foregroundComposite/fragment.wesl for the per-pixel rationale.
 *
 * ### Why no 'resize' method
 *
 * The fullscreen pipeline is viewport-independent.  The foreground view
 * is passed into 'draw' on every call (not cached), so a canvas resize
 * needs no bookkeeping here — the caller simply passes the new view.
 */

export type ForegroundComposite = {
  /**
   * Encode the foreground OVER-composite draw into an already-open
   * render pass against the HDR target.
   *
   * @param pass  Render-pass encoder writing into the HDR target.
   *              Must have been opened with 'loadOp: "load"' so existing
   *              HDR content is preserved and composited into.
   * @param src   Full-resolution 'rgba16float' foreground colour view
   *              ('ForegroundOffscreen.colorView').  Bound fresh every
   *              draw so resize invalidation is handled by the caller.
   */
  draw(pass: GPURenderPassEncoder, src: GPUTextureView): void;
  /**
   * No-op — sampler, bind-group-layout, and pipeline have no explicit
   * destroy methods (GC'd when their last reference drops).  Present for
   * lifecycle symmetry with other GPU-resource owners so the engine's
   * teardown call shape is uniform.
   */
  destroy(): void;
};
