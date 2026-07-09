/**
 * Public handle returned by `createMilkyWayPickRenderer`.
 *
 * The Milky Way's visible form is the star/dust point cloud
 * (`milkyWayCloudRenderer`), which owns no pick pipeline. To make it
 * clickable we stamp a pick billboard at the galactic centre into the
 * r32uint pick texture — invisible, pick-only, sized in the vertex shader
 * from the shared camera uniforms (the disc's world radius projected to
 * apparent pixels, floored at the pick-widened point size — the same
 * derivation galaxy points use, so the hit target always agrees with the
 * rendered frame). The identity it writes is
 * `(Source.MilkyWay << 27) | (0 + PICK_SENTINEL_OFFSET)`; the MW carries
 * no per-record `localIdx`, so it is always 0.
 *
 * Mirrors `StructureMarkerRenderer.pickRing`'s binding contract: the
 * caller (the engine's pick pass) has already bound `@group(0)` (the
 * points pick uniform buffer); this renderer binds `@group(1)` (a dummy
 * zeroed FadeUniforms) + `@group(2)` (the static MW pick uniform carrying
 * the source code + world centre + disc radius) and emits one
 * `draw(6, 1)`.
 */

export type MilkyWayPickRenderer = {
  /** Human-readable identifier — `'milkyWayPickRenderer'`. */
  readonly label: string;
  /**
   * Record ONE pick billboard at `MILKY_WAY_CENTER_WORLD` into the
   * caller-supplied pick pass. The caller has already bound `@group(0)`
   * (the points pick uniform buffer — camera + pointSizePx + pxPerRad);
   * this binds `@group(1)` (dummy fade) + `@group(2)` (the static MW pick
   * uniform) and emits `draw(6, 1)`. No-op when constructed with a null
   * device.
   *
   * Sizing happens on the GPU: the vertex shader projects the disc's
   * world radius to its apparent on-screen half-extent using the same
   * camera uniforms the pick pass replays, so no per-pick size argument
   * exists. Gating on disk visibility is the CALLER's job — the pick
   * program only invokes this row when `milkyWayLayer.enabled` passes
   * against the pick-time camera — so this renderer is deliberately dumb
   * and draws whenever told.
   */
  pickMilkyWay(pass: GPURenderPassEncoder): void;
  /** Release GPU resources. No-op under a null device. */
  destroy(): void;
};
