/**
 * TexturedBodyRenderer — handle for the shared textured-sphere renderer that
 * draws every textured body EXCEPT Earth (which keeps its own renderer): the
 * seven other major planets, Earth's Moon, and the four Galilean moons.
 *
 * ### One pipeline, per-body resources
 *
 * All these bodies share one UV-sphere mesh, one pipeline, and one four-binding
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
 * renderer, so a new map role (e.g. a tangent-space `normal`) is added as ONE
 * config row rather than a fresh method + binding branch. `setMap` is the single
 * upload entry keyed by `TextureKind`.
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
   * Free a body's sphere maps and revert their bindings to the shared 1×1
   * placeholders — the eviction inverse of `setMap`. Called from the
   * `bodyTextures` slot's `onRelease` when the body leaves its proximity radius,
   * so the (up to ~135 MB at 8 k) GPU textures are actually released rather than
   * leaked. Destroys every resident sphere-map `GPUTexture`, rebuilds the bind
   * group against the placeholders, and leaves the per-body uniform buffer + ring
   * texture intact (cheap, and the body stays drawable-but-plain). A no-op for a
   * body with no resident maps.
   */
  clearTexture(bodyId: BodyTextureId): void;
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
