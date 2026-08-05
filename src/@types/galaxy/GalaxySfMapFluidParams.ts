/**
 * GalaxySfMapFluidParams — the fluid alternative to the SSPSF automaton
 * (`GalaxySfMapAutomatonParams`): density advected through a composed,
 * analytically-evaluated velocity field (shear + curl noise + event
 * impulses), semi-Lagrangian, directly in world/grid coordinates every step
 * — no percolation, no ignition roll. See `sfMapFluidStep.wesl`'s header for
 * the integration scheme and `galaxySfMapFluidEvents.ts` for how the event
 * list is generated.
 *
 * Deliberately carries NO automaton fields (`spread`/`refractorySteps`/
 * `baseIgnition`/…) even where a name would coincide (`corotationRadius`,
 * `gasRegen`) — this generator's own copy, tuned against its own dynamics,
 * never `GalaxySfMapAutomatonParams`'s. `enabled`/`generator` live on the
 * shared `GalaxySfMapParams` (`GalaxyFieldTuning.sfMap`), not here.
 */
export type GalaxySfMapFluidParams = {
  /** Advection iterations per rebuild — the fluid's own step budget, parallel to `GalaxySfMapAutomatonParams.steps`. */
  readonly steps: number;
  /** Events spawned per step, on average — total events over a run is ~`eventRate * steps` (capped, see `galaxySfMapFluidEvents.ts`). */
  readonly eventRate: number;
  /** Outward kernel-velocity amplitude an event starts at, in texels/step; decays to 0 over `impulseDuration`. */
  readonly impulseStrength: number;
  /** Steps an event stays active after birth — sets both the wall's growth window and how many events overlap at once. */
  readonly impulseDuration: number;
  /** Base kernel radius in ring-texel-equivalent units; grows with an event's own age (age^0.6, snowplough-ish) up to this scale. */
  readonly radiusScale: number;
  /** Curl-noise (divergence-free) velocity amplitude, in texels/step — the turbulent stirring term. */
  readonly curlStrength: number;
  /** Curl-noise spatial frequency, in texels^-1 — higher values give smaller stirring cells. */
  readonly curlScale: number;
  /** Differential-rotation shear amplitude, same `(1/r - 1/corotationRadius)` formula `GalaxySfMapAutomatonParams.shearRate` uses — this generator's own copy. */
  readonly shearStrength: number;
  /** Pattern-speed radius the shear vanishes at — this generator's own copy, not `GalaxySfMapAutomatonParams.corotationRadius`. */
  readonly corotationRadius: number;
  /** Gas relaxation rate toward 1.0 per step, applied AFTER advection — this generator's own copy, same role as `GalaxySfMapAutomatonParams.gasRegen`. */
  readonly gasRegen: number;
  /** Blend rate of the per-texel `oldActivity` trace toward this step's event intensity (`w' = mix(w, eventStamp, emaRate)`) — an EMA, not the automaton's decay+gain pair. */
  readonly emaRate: number;
};
