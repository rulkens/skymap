/**
 * GalaxyIsmMapFluidParams — the ISM map's generator: density advected
 * through a composed, analytically-evaluated velocity field (shear + curl
 * noise + event impulses), semi-Lagrangian, directly in world/grid
 * coordinates every step. See `ismMapFluidStep.wesl`'s header for the
 * integration scheme. `enabled`/`generator` live on the shared
 * `GalaxyIsmMapParams` (`GalaxyFieldTuning.ismMap`), not here.
 */
export type GalaxyIsmMapFluidParams = {
  /** Advection iterations per rebuild. */
  readonly steps: number;
  /** Events spawned per step, on average — total events over a run is ~`eventRate * steps` (capped, see `galaxyIsmMapFluidEvents.ts`). */
  readonly eventRate: number;
  /** Outward kernel-velocity amplitude an event starts at, in texels/step; decays to 0 over `impulseDuration`. */
  readonly impulseStrength: number;
  /** Steps an event stays active after birth — sets both the wall's growth window and how many events overlap at once. */
  readonly impulseDuration: number;
  /**
   * Base kernel radius in ring-texel-equivalent units; grows with an event's
   * own age (age^0.6, snowplough-ish) up to this scale. The grid is
   * log-radial (`ismMapRingRadius`), so a fixed texel radius is a physical
   * size that grows `∝ r` — outer-disc events blow physically larger bubbles
   * than inner-disc ones. That's a coincidence of the grid parameterisation,
   * not a modeled choice, and the tuned look leans on it: converting to
   * physical units without recalibrating would visibly shrink every
   * outer-disc wall.
   */
  readonly radiusScale: number;
  /** Curl-noise (divergence-free) velocity amplitude, in texels/step — the turbulent stirring term. */
  readonly curlStrength: number;
  /** Curl-noise spatial frequency, in texels^-1 — higher values give smaller stirring cells. */
  readonly curlScale: number;
  /** Differential-rotation shear amplitude, `(1/r - 1/corotationRadius)` formula. */
  readonly shearStrength: number;
  /** Pattern-speed radius the shear vanishes at. */
  readonly corotationRadius: number;
  /** Gas relaxation rate toward 1.0 per step, applied AFTER advection. */
  readonly gasRegen: number;
  /** Blend rate of the per-texel `activity` trace toward this step's event intensity (`w' = mix(w, eventStamp, emaRate)`) — an EMA. */
  readonly emaRate: number;
  /** Velocity term pointing up the arm-forcing field's gradient, in texels/step per unit forcing-gradient — the SAME baked field `galaxyIsmMapArmForcing.ts` builds, read here as a texture instead of biasing event placement. Damped by `ismMapFluidStep.wesl`'s own `ARM_GATHER_SAT` as local dust piles up. */
  readonly armGather: number;
  /**
   * Drag on the shear velocity by the arm-forcing field at THIS texel (not
   * the gradient `armGather` reads) — `ismMapFluidVelocity.wesl`'s
   * `composedVelocity` applies `shearVel * max(0, 1 - armDrag * forcingSelf)`.
   * Gas decelerating inside the arm plus Pass B's convergence-piles-density
   * term turns the stall into a lane, upstream-sharp and downstream-soft,
   * flipping sides at corotation with the shear sign. Units: inverse forcing
   * (dimensionless [0,1], peak 1 at a ridge crest); full stall needs `armDrag >= 1`.
   */
  readonly armDrag: number;
  /**
   * Directional gate on `armGather` above, [0,1] dimensionless —
   * `ismMapFluidVelocity.wesl`'s `composedVelocity` applies the gather term
   * at full strength on the upstream flank `armDrag` stalls, scaled by
   * `1 - laneBias` downstream, so the lane's asymmetry survives the gather
   * term's own pull. 0 (default) is symmetric gather, bit-identical to
   * having no bias.
   */
  readonly laneBias: number;
  /**
   * Signed azimuthal offset, in az texels, of the `armGather` term's OWN
   * forcing sample — `ismMapFluidVelocity.wesl`'s `composedVelocity` evaluates
   * the gather gradient at `az + sign(shearVelAz) * gatherOffset`: gas
   * gathers where the drift feeds it from, one shear-flank upstream, not
   * exactly on the crest. The `sign(shearVelAz)` multiply is load-bearing —
   * drift direction (and so which flank is upstream) reverses at
   * corotation, so a fixed-sign offset would aim behind the crest on one
   * side and ahead of it on the other. 0 (default) samples the crest texel, bit-identical.
   */
  readonly gatherOffset: number;
  /**
   * Explicit diffusion coefficient for gas/dust density, in texel²/step
   * (`ismMapFluidStep.wesl`'s `diffusionLaplacian`) — the repulsion
   * `armGather`'s attraction has nothing to balance without it; sets arm
   * band width and kills grid-scale checkerboard collapse. Stable only for
   * coefficient ≤ 0.25. A `v += -k * grad(gas)` velocity term is the wrong
   * fix here: central-difference pressure on a collocated grid is blind to
   * checkerboard modes and vanishes at a 1-texel spike's own peak.
   */
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
