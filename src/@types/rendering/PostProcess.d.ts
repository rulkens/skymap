/**
 * PostProcess — HDR offscreen target + the swap-chain tone-map pass.
 *
 * Owns the rgba16float HDR texture every renderer draws into.  Its
 * `draw` opens the frame's final render pass on the swap chain and
 * delegates the fullscreen tone-map blit — HDR view → swap chain — to
 * the shared `Compositor` ('replace' blend + tone curve).  The blit's
 * pipeline, sampler, and curve uniform live in the compositor, not
 * here; this handle keeps only the HDR target's lifecycle.
 */

import type { ToneMapCurve } from '../data/ToneMapCurve';
import type { Size } from './Size';

export type PostProcess = {
  /** Current HDR colour-attachment view, stable until the next `resize()` call. */
  readonly view: GPUTextureView;
  /** Recreate the HDR texture at a new size.  The old view becomes invalid. */
  resize(size: Size): void;
  /**
   * Encode the fullscreen tone-map blit `hdrView → swapView` onto the
   * caller's command encoder.  Begins+ends its own render pass.  The
   * HDR view used as the input is the one the aggregate currently
   * owns — callers no longer pass it explicitly, which prevents a
   * stale-after-resize view from leaking back in.
   *
   * @param timingDescriptor  Optional `RenderPassTimestampWrites` for
   *                          per-pass GPU profiling.  Pass `undefined`
   *                          (the default) to skip timing — the
   *                          internal render pass omits the field.
   *                          When non-undefined the descriptor is
   *                          spread into the internal
   *                          `beginRenderPass` call.
   */
  draw(
    encoder: GPUCommandEncoder,
    swapView: GPUTextureView,
    exposure: number,
    curve: ToneMapCurve,
    timingDescriptor?: GPURenderPassTimestampWrites,
  ): void;
  /** Tear down — releases the HDR texture.  The compositor owns its own uniform buffers. */
  destroy(): void;
};
