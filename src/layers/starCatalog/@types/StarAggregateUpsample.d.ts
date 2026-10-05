/**
 * StarAggregateUpsample — fullscreen pass that samples the half-resolution
 * survey-star aggregate offscreen with bilinear filtering, re-applies the star
 * pass's hue-preserving knee to the SUMMED aggregate field, and additively
 * blends the result into the HDR target.
 *
 * The twin of `AdditiveUpsample`, differing only in the composite math: that
 * one is a plain filtered blit, whereas this one knees the summed
 * scalar (carried in the offscreen alpha) so an aggregate-covered region
 * compresses like a concentrated bright leaf does — the LOD-symmetry fix. See
 * `services/gpu/shaders/starAggregateUpsample/fragment.wesl`.
 *
 * Owned by the engine alongside the other fullscreen blits with the same
 * lifetime; constructed once at `initGpu` and torn down by `destroy()`.
 *
 * ### Blend semantics — load-bearing
 *
 * The pipeline blends additive `{ srcFactor: 'one', dstFactor: 'one' }` for
 * BOTH colour and alpha, matching the aggregate stream's own blend — the
 * upsampled, knee'd value is ADDED to HDR exactly as if the aggregate glows had
 * been knee'd and drawn straight into it.
 *
 * ### Why no `resize` method
 *
 * The pipeline is viewport-independent (the covering triangle covers any
 * viewport) and the half-res texture view is rebound on every `draw` call
 * (passed in rather than cached), so a resize of the offscreen needs no
 * bookkeeping here.
 */

export type StarAggregateUpsample = {
  /**
   * Encode the fullscreen composite draw into an already-open render pass
   * against the HDR target. The caller owns the pass lifecycle
   * (`beginRenderPass` / `end`); this only records `setPipeline` /
   * `setBindGroup` / `draw`.
   *
   * @param pass          The render pass encoder writing into the HDR target
   *                      (opened with an additive-compatible `loadOp`).
   * @param halfResView   The half-resolution `star-aggregates` offscreen view
   *                      to sample. Bound fresh every draw because the view
   *                      changes on canvas resize.
   */
  draw(pass: GPURenderPassEncoder, halfResView: GPUTextureView): void;
  /**
   * No-op — sampler, bind-group-layout, and pipeline are GC'd when their last
   * reference drops. Present for lifecycle symmetry so the engine's teardown
   * call shape is uniform across GPU-resource owners.
   */
  destroy(): void;
};
