/**
 * scaleFadeBands — core's crossfade transitions, AS DATA: the rows no single Layer
 * owns (captions, the body-glint backdrop, the cubemap-capture bands). A Layer's own
 * distance window is a `bands` entry on its `visibility.ts`; a new core transition is a
 * declared row here, not a hand-rolled smoothstep. Consumed through `fadeBand`, which
 * reads direction off each row's edge ordering.
 *
 * Deliberately over comment budget: rows do NOT all key on the same quantity,
 * so each row's comment opens with "Keyed on:" naming what feeds it, plus the
 * cross-layer pop-free contracts that live nowhere else.
 */

import type { FadeBand } from '../@types/math/FadeBand';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from './labels/solarSystemLabelMaxDistance';
import { BODY_GLINT_MAX_PX } from './bodies/bodyGlintMaxPx';
import { backdropBand } from '../utils/math/backdropBand';
import { regionById } from '../utils/regions/regionById';
import { SCALE_UNITS } from './scaleUnits';
import { GALACTIC_CENTRE_ANCHOR } from './places/galacticCentre';
import { MILKY_WAY_RADIUS_MPC } from './milkyWay/milkyWayRadiusMpc';

// Each near-field extent is read from the region whose content the row gates,
// so a band cannot end up keyed on a scale that belongs to a different regime.
const NEIGHBOURHOOD_EXTENT_MPC = regionById('solar-neighbourhood').extentMpc;
const SOLAR_SYSTEM_EXTENT_MPC = regionById('solar-system').extentMpc;

// The neighbourhood extent in pc — Eta Carinae at ~2300 pc sets it today;
// growing the star roster carries the caption band edges with it.
const FARTHEST_STAR_PC = NEIGHBOURHOOD_EXTENT_MPC / SCALE_UNITS.PC_TO_MPC;

// R₀ — the Galactic Centre's distance from the render origin, off the same
// place seed the S-star orbits are scaled by, so the caption band cannot drift
// from the position it labels.
const SGR_A_STAR_R0_MPC = Math.hypot(...GALACTIC_CENTRE_ANCHOR.positionMpc);

export const SCALE_FADE_BANDS = {
  // Keyed on: the STAR's own distance from the camera, pc. Caption edges scale
  // with the roster via FARTHEST_STAR_PC. Pop-free contract with the caption
  // gate: `goneAt·PC_TO_MPC + 2·EXTENT ≤ SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`
  // (equality at goneAt = 2·EXTENT) — a caption always reaches 0 before the
  // layer's gate cuts it, so the cut cannot pop.
  starCaption: { fullAt: FARTHEST_STAR_PC * 1.1, goneAt: FARTHEST_STAR_PC * 2 },

  // Keyed on: CAMERA distance from the `solar-system` region's anchor, Mpc —
  // the same dissolve-before-the-gate contract as the star Layer's own backdrop
  // dissolve, one scale-decade in. Both consumers DISABLE outright at 0 ("opacity
  // 0 ⇒ no render"), so this far-dissolve is the binding smooth gate; the 2×/10×
  // multiples are an eye-tuning starting point.
  bodyGlintBackdrop: backdropBand(SOLAR_SYSTEM_EXTENT_MPC),

  // Keyed on: CAMERA distance from the render origin, Mpc (the Sun sits there,
  // so this IS the caption's own distance). A fade-IN toward the solar system;
  // `goneAt` equals `labelsNearPass`'s enable gate BY IMPORT so the
  // fade-in cannot pop; `fullAt` = half the gate is the taste knob.
  sunCaption: {
    fullAt: SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC / 2,
    goneAt: SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC,
  },

  // Keyed on: the CAPTION's own distance from the camera, Mpc — the only reach
  // the caption has (no layer-gate term; see `captionFadeRules`); the pick
  // stamp in `starPointsPass` reads this band rather than restating its edges.
  // `fullAt` = R₀, full from Earth all the way in; `goneAt` a disc DIAMETER
  // out, tied to the galaxy's own size. NOT derived from
  // `galactic-centre.extentMpc`: that measures the S-star orbits, five orders
  // of magnitude tighter, and would put the name's onset inside the cluster it
  // labels.
  sgrAStarCaption: {
    fullAt: SGR_A_STAR_R0_MPC,
    goneAt: MILKY_WAY_RADIUS_MPC * 2,
  },

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
