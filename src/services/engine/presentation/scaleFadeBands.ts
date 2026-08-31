/**
 * scaleFadeBands — the descent's crossfade transitions, AS DATA. Every scale
 * the camera crosses dissolves one kind of content in and another out; a new
 * transition is a declared row, not a hand-rolled smoothstep. Consumed through
 * `fadeBand`, which reads direction off each row's edge ordering.
 *
 * Deliberately over comment budget: rows do NOT all key on the same quantity,
 * so each row's comment opens with "Keyed on:" naming what feeds it, plus the
 * cross-layer pop-free contracts that live nowhere else.
 */

import type { FadeBand } from '../../../@types/math/FadeBand';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../frame/foregroundMaxDistance';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../frame/solarSystemLabelMaxDistance';
import { BODY_GLINT_MAX_PX } from '../frame/partitionBodiesByPresentation';
import { regionById } from '../../../utils/scene/regionById';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SGR_A_STAR_ANCHOR } from '../../../data/bodies/sceneSgrAStar';
import { MILKY_WAY_RADIUS_MPC } from '../galaxyGenerator/v1/milkyWayCalibration';

// Each near-field extent is read from the region whose content the row gates,
// so a band cannot end up keyed on a scale that belongs to a different regime.
const NEIGHBOURHOOD_EXTENT_MPC = regionById('solar-neighbourhood').extentMpc;
const SOLAR_SYSTEM_EXTENT_MPC = regionById('solar-system').extentMpc;

// The neighbourhood extent in pc — Eta Carinae at ~2300 pc sets it today;
// growing the star roster carries the caption band edges with it.
const FARTHEST_STAR_PC = NEIGHBOURHOOD_EXTENT_MPC / SCALE_UNITS.PC_TO_MPC;

// Eye-tuned recede edges, in kpc — the scale the tuning conversation happens at.
const CONSTELLATIONS_FULL_AT_KPC = 1;
const CONSTELLATIONS_GONE_AT_KPC = 10;

// R₀ — the Galactic Centre's distance from the render origin, off the same seed
// the S-star orbits are scaled by, so the caption band cannot drift from the
// position it labels.
const SGR_A_STAR_R0_MPC = Math.hypot(...SGR_A_STAR_ANCHOR.positionMpc);

// The shape `starBackdrop` and `bodyGlintBackdrop` share — full at 2× a
// region's extent, gone by 10× — one home so the two cannot drift apart.
const BACKDROP_FULL_AT_EXTENT_MULTIPLE = 2;
const BACKDROP_GONE_AT_EXTENT_MULTIPLE = 10;

export const backdropBand = (regionExtentMpc: number): FadeBand => ({
  fullAt: regionExtentMpc * BACKDROP_FULL_AT_EXTENT_MULTIPLE,
  goneAt: regionExtentMpc * BACKDROP_GONE_AT_EXTENT_MULTIPLE,
});

export const SCALE_FADE_BANDS = {
  // Keyed on: CAMERA distance from the heliocentric render origin, Mpc.
  // Cosmic-scale content yields once the local starfield fills the near field:
  // outer edge = FOREGROUND_MAX_DISTANCE_MPC BY IMPORT, exactly where that
  // starfield switches on. Consumers: the survey point clouds (draw + pick;
  // the famous catalog is exempt), structure markers + labels, the "You are
  // here" label, and scalar-volume liveness. The MW impostor deliberately
  // OUTLIVES this band on its own `milkyWayApproachSun` row — it renders on
  // NEAR0 and CAN draw inside the cosmological near plane.
  surveyDeepZoom: { fullAt: FOREGROUND_MAX_DISTANCE_MPC, goneAt: 0.002 },

  // Keyed on: CAMERA distance from the heliocentric render origin — the Sun —
  // Mpc. The impostor's fade for the descent toward the Sun: full ≥ 2 kpc,
  // gone ≤ 200 pc — deep enough that the procedural clumps hand off to the
  // REAL Gaia catalog (fully crossfaded in inside 8 kpc, gaia-stars
  // crossfadePc) instead of vanishing above the starfield that replaces them.
  milkyWayApproachSun: { fullAt: 0.002, goneAt: 0.0002 },

  // Keyed on: CAMERA distance from the `galactic-centre` region's anchor
  // (Sgr A*), Mpc. Wider than the Sun's band — the blowout is worse near the
  // Centre — and it fades fully to 0: a dim floor reads as over-bright star
  // blobs this deep, so don't add one back; past `goneAt` the S-star cluster
  // is the content.
  milkyWayApproachGc: { fullAt: 0.012, goneAt: 0.0006 },

  // Keyed on: the STAR's own distance from the camera, pc. Caption edges scale
  // with the roster via FARTHEST_STAR_PC. Pop-free contract with the caption
  // gate: `goneAt·PC_TO_MPC + 2·EXTENT ≤ SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`
  // (equality at goneAt = 2·EXTENT) — a caption always reaches 0 before the
  // layer's gate cuts it, so the cut cannot pop.
  starCaption: { fullAt: FARTHEST_STAR_PC * 1.1, goneAt: FARTHEST_STAR_PC * 2 },

  // Keyed on: CAMERA distance from the `solar-neighbourhood` region's anchor,
  // Mpc. Dissolves the minimum-size additive point backdrop before the hard
  // FOREGROUND_MAX_DISTANCE_MPC gate would pop it off — the band completing
  // STRICTLY inside the gate is what makes the gate cut invisible.
  starBackdrop: backdropBand(NEIGHBOURHOOD_EXTENT_MPC),

  // Keyed on: CAMERA distance from the `solar-system` region's anchor, Mpc —
  // the same dissolve-before-the-gate contract as `starBackdrop`, one
  // scale-decade in. Both consumers DISABLE outright at 0 ("opacity 0 ⇒ no
  // render"), so this far-dissolve is the binding smooth gate; the 2×/10×
  // multiples are an eye-tuning starting point.
  bodyGlintBackdrop: backdropBand(SOLAR_SYSTEM_EXTENT_MPC),

  // Keyed on: CAMERA distance from the render origin, Mpc (the Sun sits there,
  // so this IS the caption's own distance). A fade-IN toward the solar system;
  // `goneAt` equals `foregroundLabelsLayer`'s enable gate BY IMPORT so the
  // fade-in cannot pop; `fullAt` = half the gate is the taste knob.
  sunCaption: {
    fullAt: SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC / 2,
    goneAt: SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC,
  },

  // Keyed on: the CAPTION's own distance from the camera, Mpc — the only reach
  // the caption has (no layer-gate term; see `captionFadeRules`); the pick
  // stamp in `starPointsLayer` reads this band rather than restating its edges.
  // `fullAt` = R₀, full from Earth all the way in; `goneAt` a disc DIAMETER
  // out, tied to the galaxy's own size. NOT derived from
  // `galactic-centre.extentMpc`: that measures the S-star orbits, five orders
  // of magnitude tighter, and would put the name's onset inside the cluster it
  // labels.
  sgrAStarCaption: {
    fullAt: SGR_A_STAR_R0_MPC,
    goneAt: MILKY_WAY_RADIUS_MPC * 2,
  },

  // Keyed on: CAMERA distance from the render origin, Mpc. A recede band —
  // full at the low edge: the true-3D figures read as Earth's sky from within
  // the neighbourhood and shear apart on pull-back. The layer DISABLES
  // outright at 0 ("opacity 0 ⇒ no render"), so this is the smooth far gate;
  // the edges are eye-tuned.
  constellations: {
    fullAt: CONSTELLATIONS_FULL_AT_KPC * SCALE_UNITS.KPC_TO_MPC,
    goneAt: CONSTELLATIONS_GONE_AT_KPC * SCALE_UNITS.KPC_TO_MPC,
  },

  // Keyed on: CAMERA distance from the render origin, Mpc. An APPROACH fade —
  // full at the far edge — the veil explains a COSMIC-scale catalog gap.
  // Derived off MILKY_WAY_RADIUS_MPC (2/10 radii, chosen for feel), the same
  // posture `sgrAStarCaption` takes off R₀.
  zoneOfAvoidance: { fullAt: MILKY_WAY_RADIUS_MPC * 10, goneAt: MILKY_WAY_RADIUS_MPC * 2 },

  // Keyed on: the same quantity — composed with `zoneOfAvoidance` into a
  // visibility WINDOW: the guide recedes once the Local Group is the subject.
  // LITERAL Mpc values — no `local-group` row exists in BODY_REGIONS to derive
  // them from.
  zoneOfAvoidanceRecede: { fullAt: 2, goneAt: 6 },

  // Keyed on: a scene BODY's apparent diameter, px — a recede fade, glint full
  // at/below 1 px. Over the BODY_GLINT_MAX_PX→1 px band the glint fades in
  // while the mesh still draws: a popless handoff, BY CONSTRUCTION only while
  // `goneAt` IS the partition-boundary symbol `BODY_GLINT_MAX_PX` — one
  // source, cannot drift.
  bodyGlint: { fullAt: 1, goneAt: BODY_GLINT_MAX_PX },
} as const satisfies Readonly<Record<string, FadeBand>>;
