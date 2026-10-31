/**
 * scaleFadeBands — core's crossfade transitions, AS DATA: the rows no single Layer
 * owns (the body-glint backdrop, the cubemap-capture bands). A Layer's own
 * distance window is a `bands` entry on its `visibility.ts`; a new core transition is a
 * declared row here, not a hand-rolled smoothstep. Consumed through `fadeBand`, which
 * reads direction off each row's edge ordering.
 *
 * Deliberately over comment budget: rows do NOT all key on the same quantity,
 * so each row's comment opens with "Keyed on:" naming what feeds it, plus the
 * cross-layer pop-free contracts that live nowhere else.
 */

import type { FadeBand } from '../@types/math/FadeBand';
import { BODY_GLINT_MAX_PX } from './bodies/bodyGlintMaxPx';
import { backdropBand } from '../utils/math/backdropBand';
import { regionById } from '../utils/regions/regionById';
import { SCALE_UNITS } from './scaleUnits';

// Read from the region whose content the row gates, so the band cannot end up
// keyed on a scale that belongs to a different regime.
const SOLAR_SYSTEM_EXTENT_MPC = regionById('solar-system').extentMpc;

export const SCALE_FADE_BANDS = {
  // Keyed on: CAMERA distance from each glint's root anchor (its star), Mpc, sized
  // off the solar system's extent for every star —
  // the same dissolve-before-the-gate contract as the star Layer's own backdrop
  // dissolve, one scale-decade in. Both consumers DISABLE outright at 0 ("opacity
  // 0 ⇒ no render"), so this far-dissolve is the binding smooth gate; the 2×/10×
  // multiples are an eye-tuning starting point.
  bodyGlintBackdrop: backdropBand(SOLAR_SYSTEM_EXTENT_MPC),

  // Keyed on: a scene BODY's apparent diameter, px — a recede fade, glint full
  // at/below 1 px. Over the BODY_GLINT_MAX_PX→1 px band the glint fades in
  // while the mesh still draws: a popless handoff, BY CONSTRUCTION only while
  // `goneAt` IS the partition-boundary symbol `BODY_GLINT_MAX_PX` — one
  // source, cannot drift.
  bodyGlint: { fullAt: 1, goneAt: BODY_GLINT_MAX_PX },

  // Keyed on: CAMERA distance from the `galactic-centre` region's anchor
  // (Sgr A*), Mpc. An approach fade. Engages the black-hole lens pass on close
  // approach to Sgr A*; the far-field glint alpha is derived from this band
  // (1 - fadeBand) at its call site.
  sgrAStarLensing: { fullAt: 100 * SCALE_UNITS.AU_TO_MPC, goneAt: 500 * SCALE_UNITS.AU_TO_MPC },

  // Keyed on: CAMERA distance from the `solar-system` region's anchor (the
  // Sun), Mpc. Holds the sky bake a reflection probe is captured over, so the
  // edges are a reach, not a look: wide enough for a Voyager for two centuries
  // (170 au today, 3.6 au/yr).
  solarSystemSky: { fullAt: 500 * SCALE_UNITS.AU_TO_MPC, goneAt: 1000 * SCALE_UNITS.AU_TO_MPC },
} as const satisfies Readonly<Record<string, FadeBand>>;
