/**
 * TexturedBodyRenderer: the shared textured-sphere renderer for every textured
 * body EXCEPT Earth. One mesh, one pipeline, one five-binding layout; each
 * `BodyTextureId` owns its own uniform buffer and bind group, so a later body's
 * `draw` in the same frame never races a `queue.writeBuffer` against the pending
 * `queue.submit`. Bindings start as 1x1 placeholders; the ring binding is a real
 * (transparent) texture on every body so `ringOuterRatio == 0` is the only gate.
 * Normal maps are LINEAR `rgba8unorm` (RG is slope data), never sRGB.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { AtlasTileRect } from '../../../@types/data/AtlasTileRect';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { TextureKind } from '../../../@types/data/TextureKind';

export type TexturedBodyRenderer = Renderer & {
  /**
   * Replace a body's map for one `TextureKind` with the supplied equirectangular
   * bitmap: fresh texture in the kind's configured format with a full mip chain,
   * level 0 uploaded with `flipY`, bind group rebuilt.
   */
  setMap(bodyId: BodyTextureId, kind: TextureKind, bitmap: ImageBitmap): void;
  /**
   * Seed a body's per-(body, kind) PLACEHOLDER from one tile of the shared
   * low-resolution body atlas. `rect` is in UNFLIPPED source coordinates
   * (top-left origin, y down, as `atlasTileRect` returns); only that rect is
   * copied, so the atlas is never a bound texture. Writes the OTHER texture layer
   * from `setMap`: a committed map always shadows the tile, `clearMap` lands back
   * on it. Replacing an existing override destroys the old texture first.
   */
  setPlaceholderMap(
    bodyId: BodyTextureId,
    kind: TextureKind,
    atlas: ImageBitmap,
    rect: AtlasTileRect,
  ): void;
  /**
   * Free ONE `TextureKind`'s map for a body and revert that binding to the 1x1
   * placeholder; called from the `bodyTextures` slot's `onRelease`. Per-kind is
   * load-bearing: `surface` and `normal` have independent clamped tiers, so
   * evicting one must NOT destroy the sibling's resident texture (the demand loop
   * would not re-fetch it). No-op if the kind is not resident.
   */
  clearMap(bodyId: BodyTextureId, kind: TextureKind): void;
  /**
   * True iff this (body, kind) has any texture bound other than the shared 1x1
   * placeholder, i.e. whether the body currently RENDERS as textured. Asked of the
   * renderer, not derived from the loading slot: an atlas tile is bound with no
   * per-body slot behind it, and a slot-derived answer would double-draw it.
   */
  hasMap(bodyId: BodyTextureId, kind: TextureKind): boolean;
  /**
   * Swap a body's ring-alpha texture (binding 3), Saturn's radial strip for the
   * ring-on-planet shadow. Other bodies keep the shared transparent 1x1.
   */
  setRingTexture(bodyId: BodyTextureId, bitmap: ImageBitmap): void;
  /**
   * Draw one body into the current pass, at most once per frame. `uniforms` is the
   * 44-float (176 B) `TexturedBodyUniforms` block from `packTexturedBodyUniforms`.
   */
  draw(pass: GPURenderPassEncoder, bodyId: BodyTextureId, uniforms: Float32Array): void;
};
