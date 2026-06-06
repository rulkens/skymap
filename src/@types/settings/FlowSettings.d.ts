/**
 * FlowSettings — the user-facing state of the CF4++ flow-field overlay layer.
 *
 * Flow is a singleton overlay layer (see
 * `docs/superpowers/conventions/singleton-overlay-layers.md`): all of its
 * user-facing state lives in `settings.flow`, exactly as `filaments` /
 * `milkyWay` do. This is the shape of that slice — the master `enabled` gate
 * plus the look/motion knobs the flow renderer reads every frame.
 *
 * Named (rather than inlined into `EngineSettingsState`) because three
 * consumers reference the same shape and would otherwise re-spell it: the
 * settings bag itself (`EngineSettingsState.flow`), the `DEFAULT_FLOW` seed in
 * `data/defaults.ts`, and the flow renderer's per-frame param argument
 * (`flowFieldRenderer.encodeCompute` / `draw` / `isAnimating`). One type, one
 * source of truth.
 *
 * The tunable defaults are the spike's hand-dialled advect look — see
 * `DEFAULT_FLOW`.
 */
import type { FlowMode } from '../data/FlowMode';

export type FlowSettings = {
  /** Master layer gate (default-off; the cube demand-loads on first enable). */
  enabled: boolean;
  /** Active integration mode (default 'advect'). */
  mode: FlowMode;
  /** Pre-blend ribbon brightness multiplier, [0, 1]. */
  intensity: number;
  /** Particle count actually drawn, [0, MAX_PARTICLES]. */
  count: number;
  /** Ring spacing per trail point (world units). */
  trail: number;
  /** Advect head distance per frame (motion speed). */
  flowSpeed: number;
  /** Density-weighted seeding selectivity, [0, 1]. */
  densityBias: number;
  /** Per-step direction jitter (advect only). */
  wander: number;
  /**
   * Spherical boundary-fade width, in grid units [0, 0.5]. Ribbons fade out
   * over this band ending at the cube-inscribed sphere (grid radius 0.5), so
   * the cube edges soften into a sphere and respawns at the boundary are
   * invisible. 0 ≈ a hard sphere clip; larger pulls the fade further inward.
   */
  boundaryFadeWidth: number;
};
