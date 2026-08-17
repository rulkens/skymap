/**
 * AdditiveUpsample — fullscreen pass that reads a reduced-resolution
 * offscreen through a filtered low-pass and additively blends the result
 * into the HDR target.
 *
 * The handle carries no knowledge of what the offscreen holds; the
 * source subsystem is fixed by which view its owner passes to `draw`.
 * Several instances coexist (the scalar volume's, the Milky Way cloud
 * aggregate's), each owned by the subsystem that feeds it, so one
 * subsystem's gate can never suppress another's composite.
 *
 * Owned by the engine alongside the other fullscreen blits (compositor,
 * pick-debug overlay) with the same lifetime; constructed once at
 * `initGpu` and torn down by `destroy()`.
 *
 * ### Blend semantics — load-bearing
 *
 * The render pipeline is built with additive blending
 * '{ srcFactor: "one", dstFactor: "one", operation: "add" }' for BOTH
 * color and alpha.  That matches the blend state the producing pipeline
 * used to fill the offscreen — the offscreen holds a per-fragment SUM,
 * and adding a reconstruction of that sum to the HDR destination is what
 * drawing every contributor straight into HDR would have produced.
 *
 * ### Why no `resize` method
 *
 * The pipeline is viewport-independent (the covering triangle covers
 * any viewport) and the offscreen's texture view is rebound on every
 * `draw` call (passed in as a parameter rather than cached) so a
 * resize of that target needs no bookkeeping here.
 */

export type AdditiveUpsample = {
  /**
   * Encode the fullscreen upsample draw into an already-open render
   * pass against the HDR target.  The caller is responsible for the
   * pass's lifecycle (`beginRenderPass` / `end`) — this method only
   * records `setPipeline` / `setBindGroup` / `draw`.
   *
   * @param pass          The render pass encoder writing into the HDR
   *                      target.  Must have been opened against the
   *                      HDR colour attachment with an additive-compatible
   *                      `loadOp` (typically `'load'`, after the pre-step
   *                      that filled the offscreen has emitted it).
   * @param halfResView   The reduced-resolution offscreen view to sample.
   *                      Bound fresh on every draw because the view
   *                      changes on canvas resize.
   */
  draw(pass: GPURenderPassEncoder, halfResView: GPUTextureView): void;
  /**
   * No-op — sampler, bind-group-layout, and pipeline have no explicit
   * destroy methods (they're GC'd when their last reference drops).
   * Present purely for lifecycle symmetry so the engine's teardown call
   * shape is uniform across GPU-resource owners.
   */
  destroy(): void;
};
