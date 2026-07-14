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
 * the band, not by splitting the table. Two rows key on the camera's distance
 * from the heliocentric render origin (`hypot(view.camPos)`, Mpc); one keys on
 * a star's OWN distance from the camera (pc). Keeping them one table is the
 * point: they are all "the descent's fades", and a reader tuning the descent
 * wants them in one view.
 */

import type { FadeBand } from '../../../@types/math/FadeBand';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../frame/foregroundMaxDistance';

export const SCALE_FADE_BANDS = {
  // Keyed on: CAMERA distance from the heliocentric render origin, Mpc.
  // Cosmic-scale content recedes on deep zoom so it yields once the local
  // starfield fills the near field. Outer edge = FOREGROUND_MAX_DISTANCE_MPC
  // (exactly where that starfield switches on); inner edge = the MW approach
  // fade's inner edge, so everything dissolves together with the MW impostor
  // into the solar-system foreground. Consumers: the survey point clouds
  // (pointSpritesLayer, draw + pick — the famous catalog is exempt, its
  // galaxies stay visible as deep-zoom reference points), the structure
  // marker rings + halos and their pick (structureMarkersLayer), the
  // structure labels (produceStructureLabels — famous labels are exempt
  // with their points), and scalar-volume liveness (deriveVolumeLiveness,
  // which zeroes every field so both volume layers disable by construction).
  surveyDeepZoom: { fullAt: FOREGROUND_MAX_DISTANCE_MPC, goneAt: 0.002 },

  // Keyed on: CAMERA distance from the heliocentric render origin, Mpc.
  // The Milky-Way impostor fades out as the camera dives into the disc toward
  // the Sun: full ≥ 0.008 Mpc (~the Sun's galactocentric radius), gone ≤ 0.002
  // Mpc (well inside the inner disc, where a flat spiral painting would hang in
  // front of the solar-system view).
  milkyWayApproach: { fullAt: 0.008, goneAt: 0.002 },

  // Keyed on: the STAR's own distance from the camera, pc.
  // Local-star captions read as a neighbourhood MAP: full alpha within 12 pc
  // (past Pollux at 10.34 pc, the farthest seed, so the whole map shows from
  // Earth), gone beyond 25 pc (so the two dozen names don't clobber into one
  // pile viewed from far outside the neighbourhood).
  starCaption: { fullAt: 12, goneAt: 25 },
} as const satisfies Readonly<Record<string, FadeBand>>;
