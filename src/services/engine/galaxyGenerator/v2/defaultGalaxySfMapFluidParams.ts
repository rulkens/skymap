/**
 * First-cut defaults for the fluid SF-map generator (user, 2026-08-05) — a
 * comparison spike against the SSPSF automaton, not a calibrated look. Aimed
 * at visible structure (sheared, stirred, cavity-pocked) at the ~100pc-1kpc
 * driving scale (de Avillez & Breitschwerdt 2004's ~60-200pc), not a fit.
 */
import type { GalaxySfMapFluidParams } from '../../../../@types/galaxy/GalaxySfMapFluidParams';

export const DEFAULT_GALAXY_SF_MAP_FLUID_PARAMS: GalaxySfMapFluidParams = {
  // Same ballpark as the automaton's own 100 (per-run cost is linear in
  // this): a few more because each step here is a full-grid advection, not
  // a local percolation growth, so shear/curl need a few extra generations
  // to wind and stir visibly.
  steps: 120,
  // ~360 events over a 120-step run — "several hundred", the design's own
  // target; enough overlapping impulses for walls to collide and pile dust
  // without the grid saturating.
  eventRate: 3,
  // Outward kernel speed at age 0, in texels/step. A few texels/step lets an
  // event's wall separate visibly from its neighbours inside `impulseDuration`.
  impulseStrength: 1.2,
  // 25 steps: long enough for a kernel to grow past its birth-texel footprint
  // into a resolvable wall (age^0.6 growth), short enough that many
  // independent events accumulate rather than one smear dominating the map.
  impulseDuration: 25,
  // Base kernel radius in ring-texel-equivalent units (512 rings span the
  // whole disc's log-radial extent) — a few texels keeps a fresh event's
  // core small relative to the grid while still being resolvable once grown.
  radiusScale: 3,
  // Modest: shear + events should read as the dominant structure, curl adds
  // turbulent texture on top rather than washing the other two out.
  curlStrength: 0.6,
  // 1/0.05 = 20-texel noise period — several stirring cells across the disc
  // at this grid's 1536-texel azimuthal span.
  curlScale: 0.05,
  // Same value as the automaton's shipped `shearRate` — same physical
  // quantity (pattern-relative differential rotation), no reason to start
  // this generator's own copy anywhere else.
  shearStrength: 0.16,
  // Same value as the automaton's shipped `corotationRadius` — one galaxy,
  // one pattern speed; this generator's own copy just isn't WIRED to the
  // automaton's, per the no-reuse requirement.
  corotationRadius: 7.9,
  // Same value as the automaton's shipped `gasRegen` — the contrast knob,
  // same starting point.
  gasRegen: 0.06,
  // Half-life ln(0.5)/ln(1-0.1) ~= 7 steps — comparable to `impulseDuration`,
  // so the activity trace tracks roughly one event's own active window.
  emaRate: 0.1,
  // The forcing field's gradient runs ~0.05/texel at a ridge's steepest
  // flank for a typical arm width (armCrossSigma at mid-disc radius spans
  // roughly 10 az-texels) — 60x that puts the gather term at ~3 texels/step
  // there, the SAME order as `shearStrength`'s own texel/step velocity at
  // outer radii (a few) and a fraction of its inner-disc peak (10-20+ near
  // corotation), so gathering reads as a visible pull toward the arm without
  // dominating the shear/curl structure already carrying the look.
  armGather: 60,
};
