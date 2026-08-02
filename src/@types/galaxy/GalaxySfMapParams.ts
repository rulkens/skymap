/**
 * GalaxySfMapParams — the SSPSF cellular automaton that grows the ISM's
 * structure (Gerola & Seiden 1978, generalizing Mueller & Arnett 1976), run
 * as a compute pass on a log-polar grid.
 *
 * The automaton produces FLOCCULENT structure, never grand design: arms enter
 * as `armForcing`, and what emerges is the spurs and feathers hanging off
 * them. See the research doc §19 before changing anything here.
 */
export type GalaxySfMapParams = {
  readonly enabled: boolean;
  /** Automaton iterations per rebuild. Structure coarsens with more steps; the shear winds it. */
  readonly steps: number;
  /** Spontaneous ignition probability per cell per step, independent of neighbours — the seed that keeps a quiet disc from dying out. */
  readonly baseIgnition: number;
  /** Added ignition probability per already-ignited neighbour. This is the percolation knob: below threshold the structure dies, far above it the disc saturates. */
  readonly spread: number;
  /** Steps a cell stays spent before its gas can ignite again. Sets the width of the trailing wake behind a propagating front. */
  readonly refractorySteps: number;
  /** Gas recovered per step as a fraction of full. The star/gas feedback the original stars-only model was criticised for lacking. */
  readonly gasRegen: number;
  /** How much the spiral ridge raises local ignition probability. 0 makes the automaton blind to the arms and the output goes purely flocculent. */
  readonly armForcing: number;
  /**
   * Corotation radius in generator units, which sets the pattern speed the
   * shear is measured against: the per-step angular offset goes as
   * `(1/r - 1/corotationRadius) * shearRate` for a flat rotation curve.
   *
   * Shearing by the bare angular velocity instead would wind the entire disc
   * one way. Relative to the pattern the shear vanishes at corotation and
   * REVERSES across it, which is what makes spurs trail oppositely inside and
   * outside — research doc §19.
   */
  readonly corotationRadius: number;
  /** Angular offset scale per step, in radians at unit `(1/r - 1/corotationRadius)`. */
  readonly shearRate: number;
};
