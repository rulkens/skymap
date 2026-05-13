/**
 * VolumeUpsample — fullscreen pass that samples the half-resolution
 * scalar-volume target with bilinear filtering and additively blends
 * the result into the HDR target.
 *
 * Owned by the engine alongside `PostProcess` because both are
 * fullscreen blits with similar lifetimes; constructed once at
 * `initGpu` and torn down by `destroy()`.
 *
 * ### Blend semantics — load-bearing
 *
 * The render pipeline is built with additive blending
 * '{ srcFactor: "one", dstFactor: "one", operation: "add" }' for BOTH
 * color and alpha.  This matches the scalar-volume pipeline's blend
 * state byte-for-byte — the upsampled half-res sample is added to the
 * HDR destination, exactly as if every field had drawn directly into
 * the HDR target.
 *
 * ### Why no `resize` method
 *
 * The pipeline is viewport-independent (the covering triangle covers
 * any viewport) and the half-res texture view is rebound on every
 * `draw` call (passed in as a parameter rather than cached) so a
 * resize of the half-res target needs no bookkeeping here.
 */

export type VolumeUpsample = {
  /**
   * Encode the fullscreen upsample draw into an already-open render
   * pass against the HDR target.  The caller is responsible for the
   * pass's lifecycle (`beginRenderPass` / `end`) — this method only
   * records `setPipeline` / `setBindGroup` / `draw`.
   *
   * @param pass          The render pass encoder writing into the HDR
   *                      target.  Must have been opened against the
   *                      HDR colour attachment with an additive-compatible
   *                      `loadOp` (typically `'load'` after the volume
   *                      pre-step has emitted its target).
   * @param halfResView   The half-resolution offscreen view to sample.
   *                      Bound fresh on every draw because the view
   *                      changes on canvas resize.
   */
  draw(pass: GPURenderPassEncoder, halfResView: GPUTextureView): void;
  /** Tear down — releases the sampler, bind-group-layout, and pipeline. */
  destroy(): void;
};
