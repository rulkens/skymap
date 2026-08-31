/**
 * Public handle returned by `createMilkyWayPickRenderer`.
 *
 * The Milky Way's visible form is the star/dust point cloud
 * (`milkyWayCloudRenderer`), which owns no pick pipeline. To make it
 * clickable we stamp a pick billboard at the galactic centre into the
 * r32uint pick texture — invisible, pick-only, sized in the vertex shader
 * from the pick camera uniforms (the disc's world radius projected to
 * apparent pixels, floored at the pick-widened point size — the same
 * derivation galaxy points use, so the hit target always agrees with the
 * rendered frame). The identity it writes is
 * `(Source.MilkyWay << 26) | (0 + PICK_SENTINEL_OFFSET)`; the MW carries
 * no per-record `localIdx`, so it is always 0.
 *
 * Unlike the COSMO pickables (rings, disks — which inherit the `@group(0)`
 * pick camera the points pick draw binds first in their shared pass), this
 * renderer BINDS ITS OWN `@group(0)`: the MW is the sole pickable on the
 * NEAR0 slab, so its pick pass has no earlier draw to inherit from. The
 * caller hands the complete pick-uniform bytes per call (built via
 * `pickUniformBytesOf` against the NEAR0 slab view); the renderer uploads
 * them to its own buffer, binds `@group(0)` (camera) + `@group(1)` (a dummy
 * zeroed FadeUniforms) + `@group(2)` (the static MW pick uniform carrying
 * the source code + world centre + disc radius), and emits one `draw(6, 1)`.
 */

export type MilkyWayPickRenderer = {
  /** Human-readable identifier — `'milkyWayPickRenderer'`. */
  readonly label: string;
  /**
   * Record ONE pick billboard at `MILKY_WAY_CENTER_WORLD` into the
   * caller-supplied pick pass. `uniformBytes` is the COMPLETE points-pick
   * uniform image for this pick's NEAR0 slab view (see
   * `pickUniformBytesOf`) — uploaded verbatim to the renderer's own
   * `@group(0)` buffer, then `@group(1)` (dummy fade) + `@group(2)` (the
   * static MW pick uniform) are bound and one `draw(6, 1)` is emitted.
   * No-op when constructed with a null device.
   *
   * Sizing happens on the GPU: the vertex shader projects the disc's
   * world radius to its apparent on-screen half-extent using the camera
   * facts in `uniformBytes`, so no per-pick size argument exists. Gating
   * on disc visibility is the CALLER's job — the pick program only invokes
   * this row when `milkyWayLayer.enabled` passes against the pick-time
   * camera — so this renderer is deliberately dumb and draws whenever told.
   */
  pickMilkyWay(pass: GPURenderPassEncoder, uniformBytes: ArrayBuffer): void;
  /** Release GPU resources. No-op under a null device. */
  destroy(): void;
};
