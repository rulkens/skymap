/**
 * EarthRenderer — handle for the true-scale, texture-mapped Earth drawn into
 * the opaque near-field foreground target.
 *
 * The Earth is a cube-sphere mesh (`cubeSphereMesh`), shaded by the shared
 * physically-based microfacet core (`lib/pbr.wesl`'s `pbrDirect`): an
 * equirectangular Blue Marble albedo plus a co-registered linear material map
 * (roughness + ocean mask) that gives the ocean its sun glint, over the
 * sun-relative light direction, with the shared `AMBIENT` floor. It binds
 * `lib/sphere.wesl`'s `EarthSurfaceUniforms` (112-byte block: the 80-byte
 * `LitBodyUniforms` prefix — mat4x4<f32> MVP + body-local sun direction — plus
 * the camera in the body's local frame and the PBR params; the ambient floor is
 * the shared `AMBIENT` const in `lib/bodyLighting.wesl`, not a uniform field) and
 * `clip_from_local`, so the CPU-side matrix layout and the GPU-side projection
 * stay a single source of truth across every sphere-shaped body.
 *
 * ### Texture lifecycle
 *
 * The Blue Marble bitmap is fetched by the proximity-gated `bodyTextures` slot
 * family under key `'earth:surface'` (minted in `initGpu`,
 * `bodyTextureSlotRegistry`), whose commit dispatches to `setMap('surface', …)`.
 * Until it lands the renderer draws a plain mid-blue sphere sampled from a 1×1
 * placeholder texture created at construction — the geometry is visible-but-plain
 * rather than absent, which keeps the descent legible even before the asset
 * arrives. `setMap('surface', bitmap)` replaces the placeholder with the real
 * equirectangular texture (via `copyExternalImageToTexture`) and rebuilds the
 * fragment bind group.
 */

import type { Renderer } from './Renderer';
import type { TextureKind } from '../data/TextureKind';

export type EarthRenderer = Renderer & {
  /**
   * Install a texture map by kind. The `'surface'` kind replaces the current
   * day-albedo texture (initially a 1×1 mid-blue placeholder) with the supplied
   * equirectangular bitmap, and `'material'` replaces the roughness/ocean-mask map
   * (initially a 1×1 all-land placeholder): each uploads via
   * `copyExternalImageToTexture` into a fresh texture sized to the bitmap — format
   * chosen by `isLinearTextureKind` (`rgba8unorm-srgb` for the sRGB surface,
   * linear `rgba8unorm` for the material data) — generates mips, then rebuilds the
   * fragment bind group so subsequent draws sample the real map. The other kinds
   * (`night`/`clouds`/`normal`) land with plans B/C/D and are inert until then —
   * one `(bodyId, kind)` family feeds one setter.
   */
  setMap(kind: TextureKind, bitmap: ImageBitmap): void;
  /**
   * Draw the Earth into the current pass. `uniforms` is a length-28 Float32Array
   * (the 112-byte `EarthSurfaceUniforms` record from `packEarthSurfaceUniforms`):
   * 16 f32 column-major MVP + 3 f32 body-local sun direction + `roughnessBase` +
   * 3 f32 camera-in-local-frame + `f0` + `sunIrradiance` + `cloudShadowStrength` +
   * 2 f32 pad — written to the uniform buffer and drawn indexed.
   */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void;
};
