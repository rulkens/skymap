/**
 * EarthRenderer: the true-scale textured Earth drawn into the opaque near-field
 * foreground target (cube-sphere mesh, `pbrDirect` shading).
 *
 * Binds `lib/sphere.wesl`'s `EarthSurfaceUniforms` (128 bytes: the 80-byte
 * `LitBodyUniforms` prefix, camera in body-local frame, PBR params); the CPU
 * packer and the WGSL struct must agree byte-for-byte.
 * Every kind starts as a 1x1 placeholder; `setMap` shadows it with a committed
 * map in a SECOND layer from `setPlaceholderMap`'s, so arrival order is irrelevant.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { AtlasTileRect } from '../../../@types/data/AtlasTileRect';
import type { TextureKind } from '../../../@types/data/TextureKind';

export type EarthRenderer = Renderer & {
  /**
   * Install a texture map by kind, uploaded into a fresh texture sized to the
   * bitmap (format from `isLinearTextureKind`: sRGB for surface/night/clouds,
   * linear for material/normal), mips generated, fragment bind group rebuilt.
   * Placeholders: surface mid-blue, material all-land, night black (no emissive),
   * normal flat, clouds transparent (alpha 0).
   */
  setMap(kind: TextureKind, bitmap: ImageBitmap): void;
  /** Destroy a kind's committed map (no-op if none); its placeholder binds again. */
  clearMap(kind: TextureKind): void;
  /**
   * Seed a kind's PLACEHOLDER from one tile of the shared low-resolution body
   * atlas. `rect` is in UNFLIPPED source coordinates (top-left origin, y down, as
   * `atlasTileRect` returns). Only that rect is copied, in the kind's format
   * (`isLinearTextureKind`, shared with `setMap`); the atlas is never a bound
   * texture. Frees the placeholder it replaces and never touches a committed map.
   * Only `'surface'` has an atlas tile.
   */
  setPlaceholderMap(kind: TextureKind, atlas: ImageBitmap, rect: AtlasTileRect): void;
  /**
   * A fresh view of `kind`'s current layer, for `surfaceTileRenderer` to share.
   * This renderer stays the sole owner: never destroy the returned view's texture.
   */
  getMapView(kind: TextureKind): GPUTextureView;
  /**
   * Draw the Earth into the current pass. `uniforms` is the length-32 Float32Array
   * from `packEarthSurfaceUniforms`.
   */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void;
};
