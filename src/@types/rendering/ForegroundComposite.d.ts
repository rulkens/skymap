/**
 * ForegroundComposite — fullscreen pass that tone-maps the foreground
 * offscreen colour texture and OVER-composites it onto the tone-mapped
 * swap chain (after the UI overlay, so opaque foreground bodies occlude the
 * galaxy-level labels behind them).
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
   * Encode the tone-map + OVER-composite draw into an already-open render
   * pass against the swap chain.
   *
   * @param pass      Render-pass encoder writing into the swap chain. Must
   *                  have been opened with 'loadOp: "load"' so the
   *                  tone-mapped scene + UI overlay are preserved and
   *                  composited onto.
   * @param src       Full-resolution 'rgba16float' foreground colour view
   *                  ('ForegroundOffscreen.colorView'). Bound fresh every
   *                  draw so resize invalidation is handled by the caller.
   * @param exposure  Tone-map exposure (clamped at point of use), matching
   *                  the scene's post-process pass.
   * @param curve     Tone-map curve selector (see ToneMapCurve), matching
   *                  the scene's post-process pass.
   */
  draw(
    pass: GPURenderPassEncoder,
    src: GPUTextureView,
    exposure: number,
    curve: number,
  ): void;
  /**
   * No-op — sampler, bind-group-layout, and pipeline have no explicit
   * destroy methods (GC'd when their last reference drops).  Present for
   * lifecycle symmetry with other GPU-resource owners so the engine's
   * teardown call shape is uniform.
   */
  destroy(): void;
};
