/**
 * User-calibrated defaults for the fluid SF-map generator (2026-08-05) —
 * tuned by eye against the M74 reference look, not derived from first
 * principles or measurement. Supersedes the earlier first-cut values, which
 * were picked as a comparison spike against the SSPSF automaton rather than
 * a calibrated look.
 */
import type { GalaxySfMapFluidParams } from '../../../../@types/galaxy/GalaxySfMapFluidParams';

export const DEFAULT_GALAXY_SF_MAP_FLUID_PARAMS: GalaxySfMapFluidParams = {
  // The automaton's own budget is 100; this generator needs more because
  // each step here is a full-grid advection, not a local percolation
  // growth, so shear/curl need more generations to wind and stir visibly
  // at this calibration. Per-run cost is linear in this.
  steps: 228,
  // eventRate * steps = 1254, above SF_MAP_FLUID_MAX_EVENTS (1024) — this
  // calibration already saturates the cap, so raising eventRate further has
  // no effect without also raising the cap.
  eventRate: 5.5,
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
  curlStrength: 1.3,
  // 1/0.06 ~= 16.7-texel noise period — several stirring cells across the
  // disc at this grid's 1536-texel azimuthal span.
  curlScale: 0.06,
  // Differential-rotation shear amplitude, same `(1/r - 1/corotationRadius)`
  // formula `GalaxySfMapAutomatonParams.shearRate` uses — this generator's
  // own copy, calibrated separately (no longer pinned to the automaton's
  // shipped 0.16).
  shearStrength: 0.065,
  // Pattern-speed radius the shear vanishes at — this generator's own copy,
  // calibrated separately from (not wired to) the automaton's shipped 7.9.
  corotationRadius: 7.8,
  // Gas relaxation rate toward 1.0 per step, applied AFTER advection — this
  // generator's own copy, calibrated separately from the automaton's shipped
  // `gasRegen` (0.06), not pinned to it.
  gasRegen: 0.028,
  // Half-life ln(0.5)/ln(1-0.08) ~= 8 steps — shorter than `impulseDuration`
  // (33), so the activity trace tracks recent events rather than integrating
  // one event's whole active window.
  emaRate: 0.08,
  // Velocity pointing up the arm-forcing field's gradient, in texels/step per
  // unit forcing-gradient (see the param's own doc for the field it reads).
  // Small by calibration: a light pull toward the arm rather than a
  // dominant term — shear/curl/events already carry the look.
  armGather: 1,
  // Explicit stability bound is D <= 0.25 (see the param's own doc). Off by
  // default here: at this calibration's small `armGather`, diffusion's own
  // purpose — balancing the attraction of a gather term strong enough to
  // collapse gas onto a grid-scale line — hasn't been needed. Dial in
  // alongside armGather if that collapse shows up.
  diffusion: 0,
  // Off by default: this 2026-08-05 calibration predates the term, and must
  // stay byte-identical until the user pushes the slider.
  armDrag: 0,
};
