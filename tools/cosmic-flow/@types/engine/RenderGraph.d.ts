/**
 * RenderGraph — the engine's HDR-accumulate → tonemap render-graph stage.
 *
 * Every visualization draws additively into ONE shared `rgba16float` HDR
 * accumulation texture (trails, glyphs, density glow all sum together), and a
 * single fullscreen-triangle tonemap pass resolves that linear-light buffer to
 * the swap-chain texture. Centralising the accum target + the tonemap pipeline
 * here is what lets layers stay format-agnostic: they only learn `hdrFormat`
 * (via `EngineContext`) and never touch the swap format or the resolve.
 *
 * `accumView()` is a METHOD, not a field, because the underlying texture is
 * recreated on resize — a cached field would dangle after the first resize.
 * Callers fetch the live view each frame.
 */
export type RenderGraph = {
  /** The HDR accumulation format every layer's pipeline must target ('rgba16float'). */
  readonly hdrFormat: GPUTextureFormat;
  /** The current HDR target view. A method (not a field): the texture is rebuilt on resize. */
  accumView(): GPUTextureView;
  /** Recreate the accum texture + blit bind group iff the drawable size changed. */
  resize(width: number, height: number): void;
  /** Tonemap the accum buffer into `target`: Reinhard + contrast + sRGB gamma. */
  tonemap(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    exposure: number,
    contrast: number,
  ): void;
  /** Destroy the accum texture + blit uniform buffer. */
  dispose(): void;
};
