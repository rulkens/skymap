/**
 * User-calibrated defaults for the fluid SF-map generator (2026-08-06) —
 * tuned by eye against the M74 reference look, not derived from first
 * principles or measurement. Supersedes the 2026-08-05 calibration, which
 * ran with armGather/diffusion/armDrag/laneBias effectively off; this pass
 * turns those arm-response terms on.
 */
import type { GalaxySfMapFluidParams } from '../../../../@types/galaxy/GalaxySfMapFluidParams';

export const DEFAULT_GALAXY_SF_MAP_FLUID_PARAMS: GalaxySfMapFluidParams = {
  // The automaton's own budget is 100; this generator needs more because
  // each step here is a full-grid advection, not a local percolation
  // growth, so shear/curl need more generations to wind and stir visibly
  // at this calibration. Per-run cost is linear in this.
  steps: 144,
  // Events spawned per step; total events over a run is eventRate * steps
  // (720 here), comfortably under SF_MAP_FLUID_MAX_EVENTS (1024).
  eventRate: 5,
  // Outward kernel speed at age 0, in texels/step. A few texels/step lets an
  // event's wall separate visibly from its neighbours inside `impulseDuration`.
  impulseStrength: 1.35,
  // 33 steps: long enough for a kernel to grow past its birth-texel footprint
  // into a resolvable wall (age^0.6 growth), short enough that many
  // independent events accumulate rather than one smear dominating the map.
  impulseDuration: 33,
  // Base kernel radius in ring-texel-equivalent units (512 rings span the
  // whole disc's log-radial extent) — a few texels keeps a fresh event's
  // core small relative to the grid while still being resolvable once grown.
  radiusScale: 4.75,
  // Curl-noise (divergence-free) velocity amplitude, in texels/step — the
  // turbulent stirring term. Calibrated alongside shear/events rather than
  // kept deliberately subordinate to them.
  curlStrength: 1.35,
  // 1/0.04 = 25-texel noise period — several stirring cells across the
  // disc at this grid's 1536-texel azimuthal span.
  curlScale: 0.04,
  // Differential-rotation shear amplitude, same `(1/r - 1/corotationRadius)`
  // formula `GalaxySfMapAutomatonParams.shearRate` uses — this generator's
  // own copy, calibrated separately (no longer pinned to the automaton's
  // shipped 0.16).
  shearStrength: 0.07,
  // Pattern-speed radius the shear vanishes at — this generator's own copy,
  // calibrated separately from (not wired to) the automaton's shipped 7.9.
  corotationRadius: 5.9,
  // Gas relaxation rate toward 1.0 per step, applied AFTER advection — this
  // generator's own copy, calibrated separately from the automaton's shipped
  // `gasRegen` (0.06), not pinned to it.
  gasRegen: 0.028,
  // Half-life ln(0.5)/ln(1-0.35) ~= 1.6 steps — far shorter than
  // `impulseDuration` (33), so the activity trace tracks only the last
  // couple of steps' events rather than integrating one event's whole
  // active window.
  emaRate: 0.35,
  // Velocity pointing up the arm-forcing field's gradient, in texels/step per
  // unit forcing-gradient (see the param's own doc for the field it reads).
  // Raised from the 08-05 calibration's near-zero pull to a term that now
  // visibly gathers gas onto the arms; `diffusion` below balances the
  // collapse that pull induces.
  armGather: 5.6,
  // Explicit stability bound is D <= 0.25 (see the param's own doc). Nonzero
  // now to balance `armGather`'s much stronger pull above — without it, gas
  // collapses onto a grid-scale line at each arm crest.
  diffusion: 0.015,
  // Drags the shear (only) by local arm forcing, so drift stalls inside the
  // arm. Forcing peaks at 1 at a ridge crest, so this value (< 1) gives a
  // partial stall there — enough to build a lane without freezing it solid.
  armDrag: 0.7,
  // Directional gather: full strength on the upstream flank `armDrag`
  // stalls, scaled down by (1 - laneBias) on the downstream flank — keeps
  // the drag lane one-sided instead of gather washing it back out.
  laneBias: 0.35,
  // 0: gather still samples the crest texel itself, same as before this
  // param existed. Left off pending a visual pass on where the crest-relative
  // offset actually helps.
  gatherOffset: 0,
  // Exponential decline length of the radial gas profile `gasRegen` relaxes
  // toward, in grid-radius units (same as rMin/rMax/corotationRadius) —
  // roughly a third of this app's own Milky Way preset's rMax (~10.5-15.5,
  // per galaxySfMapArmForcing.ts's own comment on outerRadius vs per-arm
  // fadeRadius).
  gasScaleLength: 4.75,
  // Flat HI floor the radial gas profile approaches at large r, as a
  // fraction of the disc-centre value. Well below 1, so gas now thins
  // toward the outer disc instead of staying flat — `gasScaleLength` above
  // is no longer inert.
  gasFloor: 0.07,
  // 0: today's fixed ARM_BIAS_FLOOR bias, unchanged. Left off pending a
  // visual pass on how hard a gate event placement should be.
  eventArmBias: 0,
};
