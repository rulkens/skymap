import type { FlowMode } from './FlowMode';

/**
 * FlowFieldDefaults — the look/motion knobs of the flow-field overlay.
 *
 * Shared between the SOURCE_REGISTRY flow row (which seeds them) and
 * `FlowSettings` (the live, user-tunable copy), so the eight knob fields are
 * spelled in exactly one place. Mirrors how `VolumeFieldDefaults` backs both a
 * volume's registry row and its `VolumeFieldSettings`.
 */
export type FlowFieldDefaults = {
  /** Active integration mode (default 'advect'). */
  mode: FlowMode;
  /** Pre-blend ribbon brightness multiplier, [0, 1]. */
  intensity: number;
  /** Particle count actually drawn, [0, MAX_PARTICLES]. */
  count: number;
  /** Ring spacing per trail point (world units). */
  trail: number;
  /** Advect head distance per second (motion speed). */
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
