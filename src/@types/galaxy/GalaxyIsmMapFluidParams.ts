/**
 * GalaxyIsmMapFluidParams — the fluid alternative to the SSPSF automaton
 * (`GalaxyIsmMapAutomatonParams`): density advected through a composed,
 * analytically-evaluated velocity field (shear + curl noise + event
 * impulses), semi-Lagrangian, directly in world/grid coordinates every step
 * — no percolation, no ignition roll. See `ismMapFluidStep.wesl`'s header for
 * the integration scheme and `galaxyIsmMapFluidEvents.ts` for how the event
 * list is generated.
 *
 * Deliberately carries NO automaton fields (`spread`/`refractorySteps`/
 * `baseIgnition`/…) even where a name would coincide (`corotationRadius`,
 * `gasRegen`) — this generator's own copy, tuned against its own dynamics,
 * never `GalaxyIsmMapAutomatonParams`'s. `enabled`/`generator` live on the
 * shared `GalaxyIsmMapParams` (`GalaxyFieldTuning.ismMap`), not here.
 */
export type GalaxyIsmMapFluidParams = {
  /** Advection iterations per rebuild — the fluid's own step budget, parallel to `GalaxyIsmMapAutomatonParams.steps`. */
  readonly steps: number;
  /** Events spawned per step, on average — total events over a run is ~`eventRate * steps` (capped, see `galaxyIsmMapFluidEvents.ts`). */
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
  /** Differential-rotation shear amplitude, same `(1/r - 1/corotationRadius)` formula `GalaxyIsmMapAutomatonParams.shearRate` uses — this generator's own copy. */
  readonly shearStrength: number;
  /** Pattern-speed radius the shear vanishes at — this generator's own copy, not `GalaxyIsmMapAutomatonParams.corotationRadius`. */
  readonly corotationRadius: number;
  /** Gas relaxation rate toward 1.0 per step, applied AFTER advection — this generator's own copy, same role as `GalaxyIsmMapAutomatonParams.gasRegen`. */
  readonly gasRegen: number;
  /** Blend rate of the per-texel `activity` trace toward this step's event intensity (`w' = mix(w, eventStamp, emaRate)`) — an EMA, not the automaton's decay+gain pair. */
  readonly emaRate: number;
  /** Velocity term pointing up the arm-forcing field's gradient, in texels/step per unit forcing-gradient — the SAME baked field the automaton samples (`galaxyIsmMapArmForcing.ts`), read here as a texture instead of biasing event placement. Damped by `ismMapFluidStep.wesl`'s own `ARM_GATHER_SAT` as local dust piles up. */
  readonly armGather: number;
  /**
   * Drag on the shear velocity by the arm-forcing field at THIS texel (not
   * the gradient `armGather` reads) — `ismMapFluidVelocity.wesl`'s
   * `composedVelocity` applies `shearVel * max(0, 1 - armDrag * forcingSelf)`.
   * Caricatures a real spiral shock: gas drifting through the pattern at
   * shear speed decelerates inside the arm, and Pass B's existing
   * convergence-piles-density term (`divV < 0`) turns that stall into a lane
   * on the upstream edge, softening downstream, flipping sides at
   * corotation with the shear sign — emergent, not authored. Units: inverse
   * forcing (forcing is dimensionless [0,1], peak 1 at a ridge crest — see
   * `galaxyIsmMapArmForcing.ts`'s clamp); full stall at the crest needs
   * `armDrag >= 1`.
   */
  readonly armDrag: number;
  /**
   * Directional gate on `armGather` above, [0,1] dimensionless —
   * `ismMapFluidVelocity.wesl`'s `composedVelocity` applies the gather term at
   * full strength where the (undragged) shear carries gas toward the ridge
   * (the upstream flank `armDrag` stalls), scaled by `1 - laneBias` on the
   * downstream flank. `armGather` alone re-symmetrizes the one-sided stall
   * lane `armDrag` creates by pulling gas back from both sides; this makes
   * that pull directional so the lane's asymmetry survives it. 0 (default)
   * is today's symmetric gather, bit-identical.
   */
  readonly laneBias: number;
  /**
   * Signed azimuthal offset, in az texels, of the `armGather` term's OWN
   * forcing sample — `ismMapFluidVelocity.wesl`'s `composedVelocity` evaluates
   * the gather gradient at `az + sign(shearVelAz) * gatherOffset`, not at the
   * texel itself. Gas doesn't gather exactly on the crest; it gathers where
   * the drift feeds it from, one shear-flank upstream of it. Multiplying by
   * `sign(shearVelAz)` (rather than a fixed-sign shift) is load-bearing:
   * drift direction — and therefore which flank is upstream — reverses at
   * corotation, so a fixed-sign offset would aim the gather target BEHIND
   * the crest on one side of corotation and AHEAD of it on the other. 0
   * (default) samples the crest texel itself, bit-identical to today.
   */
  readonly gatherOffset: number;
  /** Explicit diffusion coefficient for gas/dust density, in texel²/step (`ismMapFluidStep.wesl`'s `diffusionLaplacian`) — the repulsion `armGather`'s attraction has nothing to balance without it; sets arm band width and kills grid-scale (1-texel-line, checkerboard) collapse. Explicit 2D diffusion is stable only for coefficient ≤ 0.25. A `v += -k * grad(gas)` velocity term was tried first and rejected: central-difference pressure on a collocated grid is blind to checkerboard modes and vanishes at a 1-texel spike's own peak — don't reintroduce it. */
  readonly diffusion: number;
  /** Exponential decline length of `gasProfile` (`ismMapFluidStep.wesl`), grid-radius units (same as `rMin`/`rMax`/`corotationRadius`) — sets how fast the star-forming (H2-like) gas disc thins with radius. */
  readonly gasScaleLength: number;
  /** `gasProfile`'s r→∞ floor fraction [0,1] — the flat HI component underneath the exponential decline. 1 makes the profile identically 1.0 everywhere (the pre-profile, uniform-seed calibration). */
  readonly gasFloor: number;
  /**
   * Placement floor for `galaxyIsmMapFluidEvents.ts`'s CDF, [0,1] dimensionless
   * — the floor becomes `ARM_BIAS_FLOOR * (1 - eventArmBias)`, so 0 (default)
   * is today's fixed `ARM_BIAS_FLOOR` bias (byte-identical) and 1 zeroes the
   * floor entirely, turning the bias into a hard gate: every event lands
   * where `armForcing` is nonzero, strictly on the ridge. CPU-only — no UBO
   * member, no WESL mirror.
   */
  readonly eventArmBias: number;
  /**
   * Tracer mass deposited per step at texels an event stamps this step,
   * times the texel's own (post-advection) local gas — SF converts gas to
   * stars, and the impulse's own multi-step duration is absorbed into this
   * constant rather than modelled separately. `ismMapFluidStep.wesl`'s
   * `starsDeposit` UBO lane.
   */
  readonly starsDeposit: number;
  /**
   * Per-step retention of the advected stars tracer (`stars' = advected(stars)
   * * starsDecay + ...`) — `retention^steps` over a rebuild's step count is
   * this generator's own dial on the measured ~40-100 Myr structural
   * dissolution clock young stellar associations show
   * (`docs/research/m74-jwst/11-young-star-clustering.md`), not a literal
   * Myr/step conversion. `ismMapFluidStep.wesl`'s `starsDecay` UBO lane.
   */
  readonly starsDecay: number;
};
