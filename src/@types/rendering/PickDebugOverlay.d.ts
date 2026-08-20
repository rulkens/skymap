/**
 * PickDebugOverlay — fullscreen pass that samples the r32uint pick
 * texture and colour-maps it over the tone-mapped swap chain.  Toggled
 * by the `debug.overlays['pick-buffer']` setting; off by default.
 *
 * ### Why it exists
 *
 * The pick texture is invisible by design — its fragments encode
 * `(sourceCode, localIdx)` identities, not colours, and they're
 * normally read back as a single texel per click.  When pick / hover
 * behaviour looks wrong (e.g. famous galaxies rendered as large
 * thumbnails feel hard to select), the developer has no way to see
 * what the pick pass actually rasterised.  This overlay turns the
 * pick texture into a viewable layer: each pixel that was claimed by
 * a billboard gets a per-source colour, with a per-instance brightness
 * hash so adjacent picks visually separate.
 *
 * ### Blend semantics
 *
 * Premultiplied OVER ('srcFactor: "one", dstFactor: "one-minus-src-
 * alpha"') against the swap chain.  Matches the marker-lines / labels /
 * structureMarker overlay convention so future composite changes only
 * have to consider one blend mode.
 *
 * ### Why no resize method
 *
 * The pipeline is viewport-independent (the covering triangle covers
 * any viewport) and the pick texture view is rebound on every draw
 * call (passed in as a parameter rather than cached), so a viewport
 * resize needs no bookkeeping here.
 */

export type PickDebugOverlay = {
  /**
   * Encode the fullscreen overlay draw into an already-open render
   * pass against the swap-chain texture.  The caller is responsible
   * for the pass's lifecycle (`beginRenderPass` / `end`) — this
   * method only records `setPipeline` / `setBindGroup` / `draw`.
   *
   * @param pass     The render pass encoder writing into the swap
   *                 chain.  Must have been opened with 'loadOp:
   *                 "load"' so the underlying tone-mapped frame is
   *                 preserved (the overlay draws on top via OVER).
   * @param pickView A view of the pick texture (r32uint, sized to
   *                 the canvas).  Bound fresh on every draw because
   *                 the texture is recreated on canvas resize.
   */
  draw(pass: GPURenderPassEncoder, pickView: GPUTextureView): void;
  /**
   * No-op — pipeline + bind-group-layout have no explicit destroy
   * methods (GC'd when their last reference drops).  Present for
   * lifecycle symmetry with the other GPU-resource owners.
   */
  destroy(): void;
};
