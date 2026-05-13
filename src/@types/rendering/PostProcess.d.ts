/**
 * PostProcess — combined HDR offscreen target + tone-map pass.
 *
 * Owns the rgba16float HDR texture every renderer draws into and the
 * fullscreen tone-map blit that compresses it onto the swap chain.
 * Merged into one handle because the two halves have identical
 * lifetimes (HDR pass writes the texture, post-process samples it).
 */

import type { ToneMapCurve } from '../data/ToneMapCurve';
import type { Size } from './Size';

export type PostProcess = {
  /** Current HDR colour-attachment view, stable until the next `resize()` call. */
  readonly view: GPUTextureView;
  /**
   * Half-resolution rgba16float view sized at `floor(canvas / 2)` per axis
   * (minimum 1 px).  Used as the colour attachment for the scalar-volume
   * pass — every volume field raymarches into this target with additive
   * blending, then a fullscreen upsample pass bilinearly samples it and
   * additively blends into the HDR target.
   *
   * Why on `PostProcess` rather than its own module: the half-res target's
   * lifetime is identical to the HDR target's (both are sized to the
   * canvas backing store, both recreated on resize, both released on
   * destroy).  Co-locating them avoids a second resize call site and a
   * second `state.gpu.*` field — one resize touches both.
   *
   * Why `rgba16float`: matches the HDR target's precision so the additive
   * sum doesn't lose dynamic range across the up-sample boundary.  Lower
   * precision would clip the bright tail of overlapping fields.
   */
  readonly halfResView: GPUTextureView;
  /** Recreate the HDR + half-res textures at a new size.  Old views become invalid. */
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
  /** Tear down — releases the HDR texture, the half-res texture, and the tone-map uniform buffer. */
  destroy(): void;
};
