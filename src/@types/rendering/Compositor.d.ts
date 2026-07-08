/**
 * Compositor — unified factory for all "merge offscreen texture into target" pipelines.
 *
 * The Compositor owns a single cache of render pipelines keyed by (blend, dstFormat)
 * to amortize pipeline creation across all use cases. Each caller supplies a source
 * texture view, a blend mode, and optional tone-mapping parameters. When `tone` is
 * non-null, the draw call applies the shared `lib/tonemap.wesl` shader library to
 * compress HDR into the destination format. In phase 2 (CompositeStep as data),
 * tone-mapping will be baked into the animation sequence itself, decoupling it from
 * per-draw parameters.
 */

import type { CompositeBlend } from './CompositeBlend';
import type { ToneMap } from './ToneMap';

export type Compositor = {
  /** Renderer label (required by the Renderer base contract; identifies this Compositor in debug output). */
  readonly label: string;
  /**
   * Composite the source texture onto the target within the given render pass.
   *
   * The implementation selects a pipeline from its internal cache keyed by
   * (blend, dstFormat of the pass target). When `tone` is non-null, the
   * tone-map curve and exposure are applied; when null, the source is
   * treated as already LDR and passed through unchanged.
   *
   * @param pass   GPU render pass encoder (assumed to have a color attachment
   *               ready to receive the composite result).
   * @param src    Texture view containing the source to composite.
   * @param blend  Blend mode (determines how src combines with the target).
   * @param tone   Tone-mapping parameters, or null for LDR pass-through.
   */
  draw(
    pass: GPURenderPassEncoder,
    src: GPUTextureView,
    blend: CompositeBlend,
    tone: ToneMap | null,
  ): void;
  /** Tear down — releases GPU resources (pipelines, bind groups, uniform buffers). */
  destroy(): void;
};
