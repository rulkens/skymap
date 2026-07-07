/**
 * Public handle returned by `createMilkyWayPickRenderer`.
 *
 * The Milky Way's visible form is the star/dust point cloud
 * (`milkyWayCloudRenderer`), which owns no pick pipeline. To make it
 * clickable we stamp a pick billboard at the galactic centre into the
 * r32uint pick texture — invisible, pick-only, sized by the
 * caller-supplied apparent on-screen radius of the rendered disc (see
 * `milkyWayPickHalfExtentPx`). The identity it writes is
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
   * Record ONE pick billboard at `MILKY_WAY_CENTER_WORLD` into the
   * caller-supplied pick pass, sized to `halfExtentPx` screen pixels. The
   * caller has already bound `@group(0)` (CameraUniforms); this binds
   * `@group(1)` (dummy fade) + `@group(2)` (the MW pick uniform carrying
   * `Source.MilkyWay`) and emits `draw(6, 1)`. No-op when constructed with
   * a null device.
   *
   * `halfExtentPx` is the apparent on-screen radius of the rendered
   * Milky Way disc at the last visual frame's camera distance (floored at
   * the galaxy point-size minimum) — computed by the engine's
   * `milkyWayPickHalfExtentPx` helper, so the hit target tracks the glow
   * the user sees. Gating on disk visibility AND computing this px are the
   * CALLER's job — this renderer is deliberately dumb and just draws what
   * it's told, the size arriving as data exactly like the visibility
   * boolean.
   */
  pickMilkyWay(pass: GPURenderPassEncoder, halfExtentPx: number): void;
  /** Release GPU resources. No-op under a null device. */
  destroy(): void;
};
