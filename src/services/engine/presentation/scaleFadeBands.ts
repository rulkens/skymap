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
 * distinction is carried per-row by the comment naming WHICH quantity feeds
 * the band, not by splitting the table. Three rows key on the camera's distance
 * from the heliocentric render origin (`hypot(view.camPos)`, Mpc); one keys on
 * a star's OWN distance from the camera (pc); one keys on a scene body's
 * apparent DIAMETER in pixels. Keeping them one table is the point: they are all
 * "the descent's fades", and a reader tuning the descent wants them in one view.
 */

import type { FadeBand } from '../../../@types/math/FadeBand';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../frame/foregroundMaxDistance';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../frame/solarSystemLabelMaxDistance';
import { BODY_GLINT_MAX_PX } from '../frame/partitionBodiesByPresentation';

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
  // Local-star captions read as a neighbourhood MAP: full alpha within 12 pc
  // (past Pollux at 10.34 pc, the farthest seed, so the whole map shows from
  // Earth), gone beyond 25 pc (so the two dozen names don't clobber into one
  // pile viewed from far outside the neighbourhood).
  starCaption: { fullAt: 12, goneAt: 25 },

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
