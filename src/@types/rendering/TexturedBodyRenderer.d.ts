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
 * A body is drawable before its bitmap lands: at first reference it binds a 1×1
 * mid-grey placeholder surface texture and a 1×1 transparent placeholder ring
 * texture, so the geometry is visible-but-plain rather than absent. `setTexture`
 * swaps in the real surface texture (sized + full-mip-chained); `setRingTexture`
 * swaps binding 3 with Saturn's ring-alpha strip. The ring binding is a real
 * texture on every body so ONE pipeline serves ringed and ringless bodies —
 * `ringOuterRatio == 0` short-circuits any ring sampling in the fragment.
 */

import type { Renderer } from './Renderer';
import type { BodyTextureId } from '../data/BodyTextureId';

export type TexturedBodyRenderer = Renderer & {
  /**
   * Replace a body's surface texture (initially a 1×1 mid-grey placeholder) with
   * the supplied equirectangular bitmap. Creates a fresh `rgba8unorm-srgb`
   * texture sized to the bitmap with a full mip chain (`mipLevelCount` levels +
   * `RENDER_ATTACHMENT` usage), uploads level 0, runs `generateMipChain`, then
   * rebuilds that body's bind group.
   */
  setTexture(bodyId: BodyTextureId, bitmap: ImageBitmap): void;
  /**
   * Free a body's surface texture and revert its binding to the shared 1×1
   * placeholder — the eviction inverse of `setTexture`. Called from the
   * `bodyTextures` slot's `onRelease` when the body leaves its proximity radius,
   * so the (up to ~135 MB at 8 k) GPU texture is actually released rather than
   * leaked. Destroys the body's `GPUTexture`, rebuilds its bind group against the
   * placeholder, and leaves the per-body uniform buffer intact (cheap, and the
   * body stays drawable-but-plain). A no-op for a body that was never textured.
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
