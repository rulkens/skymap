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
  /**
   * Added ignition probability per already-ignited neighbour — the percolation
   * knob.
   *
   * MEASURED (`npm run galaxy-renderer:percolation`: one seeded ignition, no
   * `baseIgnition` and no arm forcing so activity can reach exactly zero, 96
   * runs per point; the threshold is where half of them are still igniting at
   * the end, and it does not move between 200 and 600 steps). Propagation
   * sustains itself above **0.231 +-0.002** at the shipped `refractorySteps` /
   * `gasRegen`. The shipped 0.164 is SUBCRITICAL by ~30%: this automaton is a
   * driven amplifier, not a self-sustaining fire. Its activity is
   * `baseIgnition` times a gain that this knob sets — x11.8 at 0.164, x40 at
   * 0.20, x83 at 0.22 over the no-propagation floor — which is why the picture
   * responds smoothly to it with no threshold to fall off.
   *
   * The threshold is `refractorySteps`' doing, not gas: 0.2314 -> 0.2288 (1%)
   * for gas fully replenished, against 0.2288 -> 0.1850 (19%) for the
   * refractory wake removed. `shearRate` does not enter it at all (0.2295 at
   * zero shear). The 0.185 left with neither term is lattice correlation — a
   * cluster's frontier cells share neighbours, so eight offspring rolls are
   * never eight independent ones, and no 2D automaton reaches the mean-field
   * 1/8 = 0.125 its receiver-side Moore neighbourhood suggests.
   *
   * Gerola & Seiden's ~0.18 is that same mean-field 1/N for their 6-cell
   * equal-area neighbourhood. It is not a target to tune toward here.
   */
  readonly spread: number;
  /**
   * Steps a cell stays spent before its gas can ignite again. Sets the width of
   * the trailing wake behind a propagating front — and, measured, it is the one
   * term that moves `spread`'s percolation threshold: 0.185 at 0 or 1 step,
   * 0.213 at 3, 0.229 at 7, 0.237 at 15 (see `spread`).
   *
   * 0 and 1 are the same automaton, because the gas channel imposes its own
   * one-step lockout: a cell that just ignited has zero gas, and `p` is
   * multiplied by gas, so it cannot re-ignite on the next step whatever this
   * says.
   */
  readonly refractorySteps: number;
  /**
   * Gas recovered per step as a fraction of full — the star/gas feedback the
   * original stars-only model was criticised for lacking, and the CONTRAST
   * knob: recovery takes `1/gasRegen` steps, which is how long a burnt void
   * stays a void rather than simmering back.
   *
   * It is NOT a percolation term. Gas only ever binds cells BEHIND a front;
   * the virgin cells ahead of it are at full gas, and those are the ones that
   * decide whether the front propagates — so replenishing gas fully moves
   * `spread`'s threshold by 1% and its gain at the shipped `spread` by 5%.
   *
   * Above `1/refractorySteps` it stops doing anything at all: gas is back to
   * full before the refractory lock clears, which is why 0.3 and 1.0 are
   * bit-identical at `refractorySteps` 7. The shipped 0.06 leaves a re-igniting
   * cell at 0.42 gas, so this end of the range is live.
   */
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
  /**
   * Shear magnitude (texels/step) at which the forcing term saturates to
   * full strength. Forced ignitions weight by `|shear| / armFluxRef`, which
   * cancels the residence-time divergence at corotation (shear -> 0) rather
   * than rewarding it — see `sfMapStep.wesl`'s `armFactor` for the derivation.
   */
  readonly armFluxRef: number;
  /**
   * Per-step multiplier on the accumulated `oldActivity` trace. At 1.0 the
   * channel integrates the FULL run ("everywhere a front passed"); below
   * that it is an EMA whose half-life is `ln(0.5)/ln(decay)` steps, so 0.985
   * forgets within ~46.
   */
  readonly activityDecay: number;
  /**
   * Added to `oldActivity` on each ignition. The channel clamps to [0,1],
   * and its steady state for a cell firing every T steps is
   * `gain / (1 - decay^T)` — gain and decay are NOT independent: raising
   * decay toward 1 demands a much smaller gain or the channel saturates to
   * flat white. Flat white and flat black are identical to the structure
   * tensor downstream (both have zero gradient), so saturation reads as "no
   * structure" exactly like blackness does.
   */
  readonly activityGain: number;
  /**
   * Fraction of an igniting cell's own dust that survives the SF event in
   * place; the rest is swept onto its 8 Moore neighbours (the snowplough
   * rule, docs/research/m74-jwst/06-ca-dust-channel-sketch.md). Lower values
   * carve deeper, darker cavities behind an advancing front — this is the
   * PAH-destruction knob, not a mass-conservation one: colliding fronts are
   * meant to pile dust past ambient into the rim, not merely relocate it.
   */
  readonly dustFloorFraction: number;
};
