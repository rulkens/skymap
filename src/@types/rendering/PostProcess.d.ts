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
  /** Recreate the HDR texture at a new size.  Old view becomes invalid. */
  resize(size: Size): void;
  /**
   * Encode the fullscreen tone-map blit `hdrView → swapView` onto the
   * caller's command encoder.  Begins+ends its own render pass.  The
   * HDR view used as the input is the one the aggregate currently
   * owns — callers no longer pass it explicitly, which prevents a
   * stale-after-resize view from leaking back in.
   */
  draw(
    encoder: GPUCommandEncoder,
    swapView: GPUTextureView,
    exposure: number,
    curve: ToneMapCurve,
  ): void;
  /** Tear down — releases both the HDR texture and the tone-map uniform buffer. */
  destroy(): void;
};
