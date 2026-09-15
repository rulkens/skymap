/**
 * Public handle returned by `createMilkyWayPickRenderer`.
 *
 * The Milky Way's visible form is the star/dust point cloud
 * (`milkyWayCloudRenderer`), which owns no pick pipeline. To make it
 * clickable we stamp a pick billboard at the galactic centre into the
 * r32uint pick texture — invisible, pick-only, sized in the vertex shader
 * from the pick camera uniforms (the disc's world radius projected to
 * apparent pixels, floored at `MILKY_WAY_PICK_MIN_SIZE_PX` — the same
 * derivation galaxy points use, so the hit target always agrees with the
 * rendered frame). The identity it writes is
 * `(Source.MilkyWay << 26) | (0 + PICK_SENTINEL_OFFSET)`; the MW carries
 * no per-record `localIdx`, so it is always 0.
 *
 * The caller hands the pick-time camera facts per call; the renderer packs
 * them, binds `@group(0)` (camera) + `@group(1)` (a dummy zeroed
 * FadeUniforms) + `@group(2)` (the static MW pick uniform carrying the
 * source code + world centre + disc radius + size floor), and emits one
 * `draw(6, 1)`.
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

export type MilkyWayPickRenderer = {
  /** Human-readable identifier — `'milkyWayPickRenderer'`. */
  readonly label: string;
  /**
   * Record ONE pick billboard at `MILKY_WAY_CENTER_WORLD` into the
   * caller-supplied pick pass. The four camera arguments are this pick's
   * NEAR0 slab view — the renderer packs them into the 96-byte `@group(0)`
   * image (the shared camera prefix, then `camPosWorld` and `pxPerRad`) in
   * its own buffer, then binds `@group(1)` (dummy fade) + `@group(2)` (the
   * static MW pick uniform) and emits one `draw(6, 1)`. No-op when
   * constructed with a null device.
   *
   * Sizing happens on the GPU: the vertex shader projects the disc's
   * world radius to its apparent on-screen half-extent from those camera
   * facts, so no per-pick size argument exists. Gating on disc visibility
   * is the CALLER's job — the pick program only invokes this row when
   * `milkyWayPass.enabled` passes against the pick-time camera — so this
   * renderer is deliberately dumb and draws whenever told.
   */
  pickMilkyWay(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
  ): void;
  /** Release GPU resources. No-op under a null device. */
  destroy(): void;
};
