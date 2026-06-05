/**
 * FlowFieldStore — per-type store for the flow-field layer's load status and
 * tunable parameters.
 *
 * Like the other per-type stores (`FilamentStore`, the survey/volume stores),
 * this holds only what the CPU owns: the load + enable status and the look/
 * motion tunables the renderer reads every frame. The GPU resources — the
 * velocity `texture_3d`, the particle/trail/accumulator buffers, the compute
 * pipelines — live on `flowFieldRenderer`, never here. The Phase-D handle
 * wraps the setters (each setter also `requestRender()`s through the handle).
 *
 * Unlike `FilamentStore` (status only), flow also carries user/dev settings
 * because flow has no separate `settings.flow` slice: for a single layer the
 * "master enabled" and "layer enabled" flags are the same bit, owned here.
 * `enabled` defaults off — the cube demand-loads on the first enable, not at
 * boot — so the store is seeded at construction for symmetry with the other
 * demand-driven data types.
 */
import type { FlowMode } from '../../data/FlowMode';

export type FlowFieldStore = {
  /** True once the velocity cube has been committed to the renderer. */
  readonly loaded: boolean;
  /** Master layer gate (default-off; flips true on user enable). */
  readonly enabled: boolean;
  /** Active integration mode (default 'advect'). */
  readonly mode: FlowMode;
  /** Pre-blend ribbon brightness multiplier, [0, 1]. */
  readonly intensity: number;
  /** Particle count actually drawn, [0, MAX_PARTICLES]. */
  readonly count: number;
  /** Ring spacing per trail point (world units). */
  readonly trail: number;
  /** Advect head distance per frame (motion speed). */
  readonly flowSpeed: number;
  /** Density-weighted seeding selectivity, [0, 1]. */
  readonly densityBias: number;
  /** Per-step direction jitter (advect only). */
  readonly wander: number;

  /** Record that the cube has been committed to the renderer. */
  setLoaded(): void;
  setEnabled(v: boolean): void;
  setMode(v: FlowMode): void;
  setIntensity(v: number): void;
  setCount(v: number): void;
  setTrail(v: number): void;
  setFlowSpeed(v: number): void;
  setDensityBias(v: number): void;
  setWander(v: number): void;
};
