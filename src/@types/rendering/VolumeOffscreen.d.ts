/**
 * VolumeOffscreen — half-resolution intermediate render target for the
 * scalar-volume raymarch.
 *
 * Every active volume field raymarches into this target with additive
 * blending; downstream, a fullscreen upsample pass bilinearly samples
 * this view and additively blends the result into the HDR target.  The
 * target therefore exists purely as a *between-passes* buffer — it
 * never reaches the tone-map step, which only ever sees the HDR view.
 *
 * Why a separate module instead of co-locating with PostProcess: the
 * two are unrelated.  PostProcess is the tone-map pass; its only
 * source is the HDR view.  The half-res target is the volume pass's
 * *output*, not the tone-map's *input*.  Putting both on PostProcess
 * confused two responsibilities; splitting keeps each module focused
 * on one render target with one consumer.
 *
 * Why `rgba16float`: matches the HDR target's precision so the
 * additive sum doesn't lose dynamic range across the upsample
 * boundary.  Lower precision would clip the bright tail of
 * overlapping fields.
 */

import type { Size } from './Size';

export type VolumeOffscreen = {
  /**
   * Current half-resolution colour-attachment view, stable until the
   * next `resize()` call.  Size is `floor(canvas / 2)` per axis with a
   * minimum of 1 px (the degenerate `floor(1 / 2) = 0` case clamps up).
   */
  readonly view: GPUTextureView;
  /** Recreate the half-res texture at a new size.  The old view becomes invalid. */
  resize(size: Size): void;
  /** Tear down — releases the half-res texture. */
  destroy(): void;
};
