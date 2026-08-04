/**
 * scaleFadeBands — the descent's crossfade transitions, AS DATA.
 *
 * Every scale the camera crosses on its way from the cosmic web down to
 * Earth's surface dissolves one kind of content in and another out. Each
 * crossing used to grow its own hand-rolled smoothstep; collecting them here
 * — the same declarative-table posture as `captionPriority.ts` — makes the
 * whole descent's fade choreography READABLE and TWEAKABLE in one place, and
 * makes a new transition a declared row rather than a fourth copy of the
 * clamp. The bands are consumed through `fadeBand`, which reads the direction
 * off each row's edge ordering (see that primitive's header).
 *
 * ### One table, mixed keying quantities
 *
 * The rows do NOT all key on the same number, and that is deliberate — the
 * distinction is carried per-row by the comment naming WHICH quantity feeds the
 * band. Six key on a camera distance in Mpc: four on the heliocentric render
 * origin directly, and `starBackdrop` / `bodyGlintBackdrop` on the camera's
 * distance from their content's REGION anchor (`regionRelativeDistanceMpc`,
 * today the same number — that anchor is the Sun). Two key on the SUBJECT's own
 * distance from the camera (`starCaption` in pc, `sgrAStarCaption` in Mpc); one
 * on a body's apparent DIAMETER in px. One table because they are all the
 * descent's fades.
 */

import type { FadeBand } from '../../../@types/math/FadeBand';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../frame/foregroundMaxDistance';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../frame/solarSystemLabelMaxDistance';
import { BODY_GLINT_MAX_PX } from '../frame/partitionBodiesByPresentation';
import { regionById } from '../../../utils/scene/regionById';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SGR_A_STAR_ANCHOR } from '../../../data/bodies/sceneSgrAStar';
import { MILKY_WAY_RADIUS_MPC } from '../galaxyGenerator/v1/milkyWayCalibration';

// The two extents this table's near-field rows scale off — each read from the
// region whose content the row gates, so a band cannot end up keyed on a scale
// that belongs to a different regime.
const NEIGHBOURHOOD_EXTENT_MPC = regionById('solar-neighbourhood').extentMpc;
const SOLAR_SYSTEM_EXTENT_MPC = regionById('solar-system').extentMpc;

// The solar neighbourhood's extent in parsecs — the derivation source for the
// star-caption band, which keys on a star's own distance from the camera in pc.
// Eta Carinae at ~2300 pc sets it today; growing the roster carries this and the
// band edges below with it.
const FARTHEST_STAR_PC = NEIGHBOURHOOD_EXTENT_MPC / SCALE_UNITS.PC_TO_MPC;

// The constellation figures' eye-tuned recede edges, in kpc — the scale the
// tuning conversation happens at (a 1 kpc solar neighbourhood, a 10 kpc
// galactic-disc framing), converted to Mpc for the band table below.
const CONSTELLATIONS_FULL_AT_KPC = 1;
const CONSTELLATIONS_GONE_AT_KPC = 10;

// The shape `starBackdrop` and `bodyGlintBackdrop` share: full at twice a
// region's own extent (still composing that region's shot a couple of extents
// out), gone by ten times it (well before the next scale frames up). One home
// so the two backdrops' identical shape cannot drift apart independently.
// R₀ — the Galactic Centre's distance from the render origin, off the same seed
// the S-star orbits are scaled by, so the caption band below cannot drift from
// the position it labels.
const SGR_A_STAR_R0_MPC = Math.hypot(...SGR_A_STAR_ANCHOR.positionMpc);

const BACKDROP_FULL_AT_EXTENT_MULTIPLE = 2;
const BACKDROP_GONE_AT_EXTENT_MULTIPLE = 10;

export const backdropBand = (regionExtentMpc: number): FadeBand => ({
  fullAt: regionExtentMpc * BACKDROP_FULL_AT_EXTENT_MULTIPLE,
  goneAt: regionExtentMpc * BACKDROP_GONE_AT_EXTENT_MULTIPLE,
});

export const SCALE_FADE_BANDS = {
  // Keyed on: CAMERA distance from the heliocentric render origin, Mpc.
  // Cosmic-scale content recedes on deep zoom so it yields once the local
  // starfield fills the near field. Outer edge = FOREGROUND_MAX_DISTANCE_MPC
  // (exactly where that starfield switches on); inner edge = 2 kpc, well
  // inside the disc. The MW impostor deliberately OUTLIVES this band — it
  // rides its own deeper `milkyWayApproach` row below, dissolving against
  // the Gaia starfield rather than with the surveys. Consumers: the survey
  // point clouds
  // (pointSpritesLayer, draw + pick — the famous catalog is exempt, its
  // galaxies stay visible as deep-zoom reference points), the structure
  // marker rings + halos and their pick (structureMarkersLayer), the
  // structure labels (produceStructureLabels — famous labels are exempt
  // with their points), the Milky-Way "You are here" label + leader stem
  // (produceMilkyWayLabel — a COSMO-slab annotation anchored at the world
  // origin, which can't project once the camera is inside the cosmological near
  // plane; the MW IMPOSTOR itself outlives this band on its deeper
  // `milkyWayApproach` row, since it lives on NEAR0 and CAN draw inside 10 kpc),
  // and scalar-volume liveness (deriveVolumeLiveness,
  // which zeroes every field so both volume layers disable by construction).
  surveyDeepZoom: { fullAt: FOREGROUND_MAX_DISTANCE_MPC, goneAt: 0.002 },

  // Keyed on: CAMERA distance from the heliocentric render origin, Mpc.
  // The Milky-Way impostor fades out as the camera dives into the disc toward
  // the Sun: full ≥ 0.002 Mpc (2 kpc, deep inside the disc), gone ≤ 0.0002 Mpc
  // (200 pc, where a flat spiral painting would hang in front of the
  // solar-system view). Eye-tuning starting point, deepened at user request
  // from the original { 0.008, 0.002 } so the procedural star/dust clumps hand
  // off to the REAL Gaia star catalog — whose crossfade is fully faded in
  // inside 8 kpc (gaia-stars crossfadePc) — instead of vanishing while still
  // hanging visibly above the starfield that replaces them.
  milkyWayApproach: { fullAt: 0.002, goneAt: 0.0002 },

  // Keyed on: the STAR's own distance from the camera, pc.
  // Local-star captions read as a neighbourhood MAP whose edges scale with the
  // roster: full alpha within `FARTHEST_STAR_PC * 1.1` (≈ 2530 pc — a hair past
  // the farthest seed, so from Earth every star, Eta Carinae at 2300 pc
  // included, sits inside the full-alpha band and the whole map reads at target
  // alpha with the declutter alone deciding what shows), gone beyond
  // `FARTHEST_STAR_PC * 2` (≈ 4600 pc, so names don't clobber into one pile
  // viewed from far outside the neighbourhood). `goneAt` is tied to the caption
  // gate by the pop-free inequality
  // `goneAt·PC_TO_MPC + 2·EXTENT ≤ SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` over the
  // same region extent (with goneAt = 2·EXTENT it holds with equality) — so a star's caption
  // always reaches 0 before the layer's gate cuts it, and the cut cannot pop.
  starCaption: { fullAt: FARTHEST_STAR_PC * 1.1, goneAt: FARTHEST_STAR_PC * 2 },

  // Keyed on: CAMERA distance from the `solar-neighbourhood` region's anchor,
  // Mpc — the Sun, so this is today the same number `surveyDeepZoom` reads off
  // the render origin. Consumer: `starPointsLayer`. The point
  // backdrop is a minimum-size additive sprite field, so at galaxy framing the
  // whole roster collapses into one bright blob — this band dissolves it
  // smoothly instead of letting the hard `FOREGROUND_MAX_DISTANCE_MPC` gate pop
  // it off. `backdropBand` (above) is the shared shape: full ≈ 4.6e-3 Mpc while
  // composing the deep-neighbourhood shot a couple of seed extents out, gone
  // ≈ 0.023 Mpc (~23 kpc), well before Milky-Way framing. The band completing
  // STRICTLY inside the gate (goneAt ≪ FOREGROUND_MAX_DISTANCE_MPC, that same
  // extent × 100) is what makes the gate cut invisible.
  starBackdrop: backdropBand(NEIGHBOURHOOD_EXTENT_MPC),

  // Keyed on: CAMERA distance from the `solar-system` region's anchor, Mpc (the
  // same `backdropBand` shape as `starBackdrop`, but applied to the SOLAR
  // SYSTEM's own extent, not the star roster's). Consumer: `bodyGlintsLayer`.
  // The planet/moon glints are minimum-size additive sprites exactly like the
  // star points, so as the camera pulls back from the solar system all ~22 of
  // them collapse onto a couple of pixels into one bright dot — this band
  // dissolves them smoothly instead of letting them ride full-brightness to the
  // coarse `FOREGROUND_MAX_DISTANCE_MPC` gate, which sits deep in Milky-Way
  // framing. Full ≈ 2.9e-10 Mpc (a couple of Neptune-orbits out), gone
  // ≈ 1.5e-9 Mpc (~10 Neptune orbits) — well before the neighbourhood, let
  // alone the galaxy, frames up. Its sibling `starBackdrop` does the same for
  // the star points one scale-decade out. The band completing STRICTLY inside
  // the shared gate (`goneAt ≪ FOREGROUND_MAX_DISTANCE_MPC`, which scales off
  // the WIDEST region extent) is what makes the hard gate cut invisible; like `starPointsLayer`,
  // `bodyGlintsLayer` DISABLES outright once this reads 0 (the "opacity 0 ⇒ no
  // render" house rule), so the far-dissolve is the binding, smooth gate for
  // the glints. `backdropBand`'s x2 / x10 multipliers are an eye-tuning
  // STARTING POINT — the user tunes them visually.
  bodyGlintBackdrop: backdropBand(SOLAR_SYSTEM_EXTENT_MPC),

  // Keyed on: CAMERA distance from the heliocentric render origin, Mpc (the Sun
  // sits at the origin, so the Sun caption's own distance-from-camera IS that
  // quantity). The Sun's name FADES IN as the camera descends toward the solar
  // system — the descent's aim point, drawn early to orient. `goneAt` equals
  // `foregroundLabelsLayer`'s enable gate BY IMPORT: the caption is exactly 0
  // the frame the layer switches on, so the fade-in can never pop. `fullAt` =
  // half the gate distance is the taste knob (how early the name reaches full
  // alpha on the way down).
  sunCaption: {
    fullAt: SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC / 2,
    goneAt: SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC,
  },

  // Keyed on: the CAPTION's own distance from the camera, Mpc — the Galactic
  // Centre's approach band, and the ONLY reach the caption has (its row carries
  // no layer-gate term; see `captionFadeRules`). Consumers:
  // `captionFadeRules.sgrAStar` and `starPointsLayer`'s pick stamp — the anchor
  // draws nothing, so this band is the whole of what invites the click, and pick
  // reads it rather than restating the edges.
  //
  // `fullAt` is R₀ itself, the Sun's own distance from the Centre: the name is
  // at FULL alpha from Earth and stays there all the way in. An earlier
  // {R₀/2, R₀} pair reached 0 exactly at the Sun, which kept the name out of the
  // solar-system view — but it also kept it out of every view that frames the
  // galaxy, which is the one that most needs it.
  //
  // `goneAt` is a disc DIAMETER out, so the name persists while the galaxy is
  // the subject and dissolves as it becomes one object among many. Tied to
  // `MILKY_WAY_RADIUS_MPC` rather than to another R₀ multiple because what the
  // far edge tracks is the galaxy's own size.
  //
  // NOT derived from `galactic-centre.extentMpc`: that measures the S-star
  // orbits, five orders of magnitude tighter, and would put the name's onset
  // inside the cluster it labels.
  sgrAStarCaption: {
    fullAt: SGR_A_STAR_R0_MPC,
    goneAt: MILKY_WAY_RADIUS_MPC * 2,
  },

  // Keyed on: CAMERA distance from the heliocentric render origin, Mpc (the same
  // quantity as `surveyDeepZoom`). Consumer: `constellationsLayer`.
  // The true-3D stick figures read as Earth's familiar sky from within the solar
  // neighbourhood and shear apart as the camera pulls away; this recede band holds
  // them at full presence through the neighbourhood and dissolves them before the
  // sheared, shrinking figures clutter the galactic-disc view (and before a whole
  // figure would go subpixel). Full within `fullAt`, deep inside the neighbourhood,
  // gone past `goneAt`, galactic-disc framing. A recede band — full at the
  // small-distance edge. Because the layer DISABLES outright once this reads 0 (the
  // "opacity 0 ⇒ no render" house rule, gated in `enabled`), this band is the smooth
  // far gate. These edges are an eye-tuning STARTING POINT, tuned visually in Task 15
  // alongside the halfwidth / tone / gap.
  constellations: {
    fullAt: CONSTELLATIONS_FULL_AT_KPC * SCALE_UNITS.KPC_TO_MPC,
    goneAt: CONSTELLATIONS_GONE_AT_KPC * SCALE_UNITS.KPC_TO_MPC,
  },

  // Keyed on: a scene BODY's apparent diameter, px. The sub-pixel glint
  // cross-fade: a body renders as a brightness-scaled additive point that is at
  // FULL strength at/below 1 px and GONE at/above `BODY_GLINT_MAX_PX` (a recede
  // fade — full at the low edge). The mesh keeps its hard `SUB_PIXEL_BODY_CULL_PX
  // = 1` cull and the partition sends everything below `BODY_GLINT_MAX_PX` to the
  // glint, so over the (BODY_GLINT_MAX_PX)->1 px band the glint fades IN while the
  // mesh still draws: at the top edge the glint is ~0 (the mesh carries), by 1 px
  // it is full (the mesh is about to cull) — a popless handoff. `goneAt` IS the
  // partition-boundary symbol `BODY_GLINT_MAX_PX`, not a hardcoded copy of it: the
  // handoff is popless BY CONSTRUCTION only while the fade edge and the partition
  // boundary are the SAME value, so they share one source and cannot drift.
  bodyGlint: { fullAt: 1, goneAt: BODY_GLINT_MAX_PX },
} as const satisfies Readonly<Record<string, FadeBand>>;
