/**
 * User-calibrated defaults for the fluid ISM-map generator (2026-08-07) —
 * tuned by eye against the M74 reference look, not derived from first
 * principles or measurement. Supersedes the 2026-08-06 calibration: this
 * pass turns the arm-response terms — gather, drag, laneBias, gatherOffset,
 * eventArmBias — into the dominant shaping terms, no longer a minor
 * modulation atop shear/curl.
 */
import type { GalaxyIsmMapFluidParams } from '../../../../@types/galaxy/GalaxyIsmMapFluidParams';

export const DEFAULT_GALAXY_ISM_MAP_FLUID_PARAMS: GalaxyIsmMapFluidParams = {
  // The automaton's own budget is 100; this generator needs more because
  // each step here is a full-grid advection, not a local percolation
  // growth, so shear/curl need more generations to wind and stir visibly
  // at this calibration. Per-run cost is linear in this.
  steps: 144,
  // Events spawned per step; total requested over a run is eventRate * steps
  // (1152 here), which buildGalaxyIsmMapFluidEvents CLAMPS to
  // ISM_MAP_FLUID_MAX_EVENTS (1024) — birthStep is drawn uniformly over the
  // run regardless of count, so the clamp lowers the effective rate
  // uniformly to ~7.1/step rather than starving the run's tail; the slider
  // value 8 is not literally what lands.
  eventRate: 8,
  // Outward kernel speed at age 0, in texels/step. A few texels/step lets an
  // event's wall separate visibly from its neighbours inside `impulseDuration`.
  impulseStrength: 0.6,
  // 33 steps: long enough for a kernel to grow past its birth-texel footprint
  // into a resolvable wall (age^0.6 growth), short enough that many
  // independent events accumulate rather than one smear dominating the map.
  impulseDuration: 33,
  // Base kernel radius in ring-texel-equivalent units (512 rings span the
  // whole disc's log-radial extent) — a few texels keeps a fresh event's
  // core small relative to the grid while still being resolvable once grown.
  radiusScale: 6,
  // Curl-noise (divergence-free) velocity amplitude, in texels/step — the
  // turbulent stirring term. Calibrated alongside shear/events rather than
  // kept deliberately subordinate to them.
  curlStrength: 1.35,
  // 1/0.04 = 25-texel noise period — several stirring cells across the
  // disc at this grid's 1536-texel azimuthal span.
  curlScale: 0.04,
  // Differential-rotation shear amplitude, same `(1/r - 1/corotationRadius)`
  // formula `GalaxyIsmMapAutomatonParams.shearRate` uses — this generator's
  // own copy, calibrated separately (no longer pinned to the automaton's
  // shipped 0.16).
  shearStrength: 0.015,
  // Pattern-speed radius the shear vanishes at — this generator's own copy,
  // calibrated separately from (not wired to) the automaton's shipped 7.9;
  // now close to that value, but coincidentally, not because it's pinned.
  corotationRadius: 8.9,
  // Gas relaxation rate toward 1.0 per step, applied AFTER advection — this
  // generator's own copy, calibrated separately from the automaton's shipped
  // `gasRegen` (0.06), not pinned to it.
  gasRegen: 0.032,
  // Half-life ln(0.5)/ln(1-0.35) ~= 1.6 steps — far shorter than
  // `impulseDuration` (33), so the activity trace tracks only the last
  // couple of steps' events rather than integrating one event's whole
  // active window.
  emaRate: 0.35,
  // Velocity pointing up the arm-forcing field's gradient, in texels/step per
  // unit forcing-gradient (see the param's own doc for the field it reads) —
  // strong enough to visibly gather gas onto the arms; `diffusion` below
  // balances the collapse that pull induces.
  armGather: 9.4,
  // Explicit stability bound is D <= 0.25 (see the param's own doc); 0.065
  // stays well under it. Balances `armGather`'s pull above — without
  // diffusion, gas collapses onto a grid-scale line at each arm crest.
  diffusion: 0.065,
  // Drags the shear (only) by local arm forcing, so drift stalls inside the
  // arm. Forcing peaks at 1 at a ridge crest, so this value (< 1) gives a
  // partial stall there — enough to build a lane without freezing it solid.
  armDrag: 0.8,
  // Directional gather: full strength on the upstream flank `armDrag`
  // stalls, scaled down by (1 - laneBias) on the downstream flank — at 0.89
  // that's ~11% strength, so the gather is now strongly one-sided rather
  // than a mild lean.
  laneBias: 0.89,
  // Calibrated by eye in the 2026-08-07 pass. Negative samples AGAINST the
  // local drift ('az + sign(shearVelAz) * gatherOffset') — ~19.5 az texels
  // upstream, the "where the drift feeds it from" placement the param's own
  // doc motivates; positive would sample downstream of the texel.
  gatherOffset: -19.5,
  // Exponential decline length of the radial gas profile `gasRegen` relaxes
  // toward, in grid-radius units (same as rMin/rMax/corotationRadius) —
  // roughly a third of this app's own Milky Way preset's rMax (~10.5-15.5,
  // per galaxyIsmMapArmForcing.ts's own comment on outerRadius vs per-arm
  // fadeRadius).
  gasScaleLength: 4.75,
  // Flat HI floor the radial gas profile approaches at large r, as a
  // fraction of the disc-centre value. 0 = pure exponential disc, no floor:
  // gas (and with it events, dust, activity) dies off entirely toward the
  // outer edge — `gasScaleLength` above alone sets the falloff.
  gasFloor: 0,
  // Calibrated by eye in the 2026-08-07 pass: floor drops to
  // ARM_BIAS_FLOOR * (1 - 0.83) ~= 0.026, a near-hard gate that concentrates
  // events onto the arms (see the param's own doc and
  // galaxyIsmMapFluidEvents.ts ~line 107) while leaving a thin off-arm
  // floor.
  eventArmBias: 0.83,
};
