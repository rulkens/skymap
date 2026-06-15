/**
 * Public handle returned by `createMilkyWayPickRenderer`.
 *
 * The Milky Way is a first-class selectable source but draws no visible
 * geometry of its own (the procedural disk impostor is a separate,
 * bespoke renderer). To make it clickable we stamp a tiny screen-size-
 * clamped pick billboard at the galactic centre into the r32uint pick
 * texture — invisible, pick-only. The identity it writes is
 * `(Source.MilkyWay << 27) | (0 + PICK_SENTINEL_OFFSET)`; the MW carries
 * no per-record `localIdx`, so it is always 0.
 *
 * Mirrors `StructureMarkerRenderer.pickRing`'s binding contract: the
 * caller (the engine's pick pass) has already bound `@group(0)`
 * (CameraUniforms); this renderer binds `@group(1)` (a dummy zeroed
 * FadeUniforms) + `@group(2)` (the MW pick uniform carrying the source
 * code + world centre) and emits one `draw(6, 1)`.
 */

export type MilkyWayPickRenderer = {
  /** Human-readable identifier — `'milkyWayPickRenderer'`. */
  readonly label: string;
  /**
   * Record ONE clamped pick billboard at `MILKY_WAY_CENTER_WORLD` into
   * the caller-supplied pick pass. The caller has already bound
   * `@group(0)` (CameraUniforms); this binds `@group(1)` (dummy fade) +
   * `@group(2)` (the MW pick uniform carrying `Source.MilkyWay`) and
   * emits `draw(6, 1)`. No-op when constructed with a null device.
   *
   * Gating on Milky-Way disk visibility is the CALLER's job (the pick
   * pass only calls this when the disk is on screen) — this renderer is
   * deliberately dumb and just draws when told.
   */
  pickMilkyWay(pass: GPURenderPassEncoder): void;
  /** Release GPU resources. No-op under a null device. */
  destroy(): void;
};
