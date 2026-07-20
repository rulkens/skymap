/**
 * TexturedBodyRenderer — handle for the shared textured-sphere renderer that
 * draws every textured body EXCEPT Earth (which keeps its own renderer): the
 * seven other major planets, Earth's Moon, and the four Galilean moons.
 *
 * ### One pipeline, per-body resources
 *
 * All these bodies share one UV-sphere mesh, one pipeline, and one five-binding
 * layout — they differ only in their surface texture and their per-frame MVP +
 * lighting uniforms. The renderer therefore holds a `Map<BodyTextureId, …>` of
 * per-body GPU resources: each body id owns its OWN uniform buffer + bind group
 * (+ its surface texture once committed). Per-body uniform buffers are the
 * `starRenderer` single-uniform-clobber fix by construction: `draw` writes a
 * body's uniform buffer immediately before that body's own indexed draw, so a
 * later body's `draw` in the same frame writes a DIFFERENT buffer — there is no
 * shared uniform for a `queue.writeBuffer` to race against the pending
 * `queue.submit` (the documented writeBuffer-vs-submit hazard).
 *
 * ### Placeholder posture
 *
 * A body is drawable before its bitmaps land: at first reference each of its
 * sphere-map bindings holds a 1×1 placeholder (mid-grey for `surface`) and a 1×1
 * transparent placeholder ring texture, so the geometry is visible-but-plain
 * rather than absent. `setMap(bodyId, kind, …)` swaps in the real map for one
 * `TextureKind`; `setRingTexture` swaps binding 3 with Saturn's ring-alpha strip.
 * The ring binding is a real texture on every body so ONE pipeline serves ringed
 * and ringless bodies — `ringOuterRatio == 0` short-circuits any ring sampling in
 * the fragment.
 *
 * ### Per-kind sphere maps
 *
 * The sphere-map bindings are driven by a per-kind config table inside the
 * renderer, so a new map role is added as ONE config row rather than a fresh
 * method + binding branch. Two kinds today: `surface` (binding 2, sRGB colour)
 * and `normal` (binding 4, LINEAR `rgba8unorm` tangent-space relief — the RG
 * channels are slope data, so it must never be an sRGB format). `setMap` is the
 * single upload entry keyed by `TextureKind`.
 */

import type { Renderer } from './Renderer';
import type { BodyTextureId } from '../data/BodyTextureId';
import type { TextureKind } from '../data/TextureKind';

export type TexturedBodyRenderer = Renderer & {
  /**
   * Replace a body's map for one `TextureKind` (initially a 1×1 placeholder) with
   * the supplied equirectangular bitmap. Creates a fresh texture in the kind's
   * configured format sized to the bitmap with a full mip chain (`mipLevelCount`
   * levels + `RENDER_ATTACHMENT` usage), uploads level 0 with `flipY`, runs
   * `generateMipChain`, then rebuilds that body's bind group so subsequent draws
   * sample the real map. The kind's binding + format come from the renderer's
   * per-kind config, so adding a map role is one config row, not a new method.
   */
  setMap(bodyId: BodyTextureId, kind: TextureKind, bitmap: ImageBitmap): void;
  /**
   * Free ONE `TextureKind`'s sphere map for a body and revert that kind's binding
   * to its shared 1×1 placeholder — the per-kind eviction inverse of `setMap`,
   * matching `setMap`'s per-kind granularity. Called from the `bodyTextures`
   * slot's `onRelease` when that (body, kind) slot leaves its proximity radius, so
   * the (up to ~135 MB at 8 k) GPU texture is actually released rather than leaked.
   * Per-kind is load-bearing: `surface` and `normal` have independent clamped
   * tiers, so evicting one kind must NOT destroy the sibling's resident texture
   * (which the demand loop would not re-fetch while its clamp is unchanged).
   * Destroys the named kind's `GPUTexture`, rebuilds the bind group so that binding
   * reverts to the placeholder while every other kind stays bound, and leaves the
   * per-body uniform buffer + ring texture intact. A no-op if the kind is not
   * resident.
   */
  clearMap(bodyId: BodyTextureId, kind: TextureKind): void;
  /**
   * Swap a body's ring-alpha texture (binding 3) — Saturn's radial ring strip
   * for the ring-on-planet shadow. Every other body keeps the shared 1×1
   * transparent placeholder (never sampled, since `ringOuterRatio == 0`).
   */
  setRingTexture(bodyId: BodyTextureId, bitmap: ImageBitmap): void;
  /**
   * Draw one body into the current pass. `uniforms` is the 28-float
   * `TexturedBodyUniforms` block (112 bytes) from `packTexturedBodyUniforms`:
   * MVP + `sunDirLocal` + the two ring ratios + the two Minnaert limb params
   * (`limbStrength`, `limbExponent`) + `camPosLocal`. Written to that body's
   * own uniform buffer, then drawn indexed. Draw each body at most once per
   * frame.
   */
  draw(pass: GPURenderPassEncoder, bodyId: BodyTextureId, uniforms: Float32Array): void;
};
