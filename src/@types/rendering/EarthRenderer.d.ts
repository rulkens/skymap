/**
 * EarthRenderer — handle for the true-scale, texture-mapped Earth drawn into
 * the opaque near-field foreground target.
 *
 * The Earth is the same UV-sphere mesh the star and planet renderers use
 * (`uvSphereMesh`), shaded by sampling an equirectangular Blue Marble
 * bitmap. It shares `lib/sphere.wesl`'s `SphereUniforms` (64-byte
 * mat4x4<f32> MVP) and `clip_from_local`, so the CPU-side matrix layout and
 * the GPU-side projection stay a single source of truth across every
 * sphere-shaped body.
 *
 * ### Texture lifecycle
 *
 * The Blue Marble bitmap is fetched by the descent-gated `earthTexture` asset
 * slot (`createEarthTextureSlot` + its `ASSET_WIRING` row), whose commit calls
 * `setTexture`. Until it lands the renderer draws a plain mid-blue sphere sampled
 * from a 1×1 placeholder texture created at construction — the geometry is
 * visible-but-plain rather than absent, which keeps the descent legible even
 * before the asset arrives. `setTexture(bitmap)` replaces the placeholder with
 * the real equirectangular texture (via `copyExternalImageToTexture`) and
 * rebuilds the fragment bind group.
 */

import type { Renderer } from './Renderer';

export type EarthRenderer = Renderer & {
  /**
   * Replace the current texture (initially a 1×1 mid-blue placeholder) with the
   * supplied equirectangular bitmap. Uploads via `copyExternalImageToTexture`
   * into a fresh `rgba8unorm-srgb` texture sized to the bitmap, then rebuilds
   * the fragment bind group so subsequent draws sample the real Earth.
   */
  setTexture(bitmap: ImageBitmap): void;
  /**
   * Draw the Earth into the current pass. `mvp` is a length-16 Float32Array
   * (column-major mat4x4<f32>, 64 bytes) folding the Earth's model scale +
   * translate + view + projection — written to the `SphereUniforms` buffer and
   * drawn indexed.
   */
  draw(pass: GPURenderPassEncoder, mvp: Float32Array): void;
};
