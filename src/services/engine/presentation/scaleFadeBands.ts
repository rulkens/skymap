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
  // The galaxy point cloud recedes on deep zoom so it yields once the local
  // starfield fills the near field. Outer edge = FOREGROUND_MAX_DISTANCE_MPC
  // (exactly where that starfield switches on); inner edge = the MW approach
  // fade's inner edge, so survey points and the MW impostor dissolve together
  // into the solar-system foreground.
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

/**
 * DESCENT_ONSET_MPC — the camera orbit-distance-to-focus at which "you've
 * descended into the solar system": the solar-system captions appear AND the
 * Blue Marble Earth texture starts loading, together. Not a fade band but a
 * hard gate, so it lives beside the bands rather than in the table.
 *
 * One home for one threshold. The caption gate (`foregroundLabelsLayer`) and
 * the Earth-texture demand gate (the `earthTexture` `ASSET_WIRING` row) were
 * two `1e-3` literals in two files, related only by "same order as" prose —
 * both key on the same quantity (orbit distance-to-focus) and both mark the
 * same moment of the descent, so the simultaneity is the intent, not a
 * coincidence to keep in sync by hand. 1e-3 Mpc (~1 kpc) sits ~13 decades of
 * zoom above the ~1e-13 Mpc where Earth first subtends a pixel — orders of
 * magnitude more lead time than the texture fetch + decode needs, so the Blue
 * Marble always resolves before the surface is visible; and it is a decade
 * below the shared foreground gate (`FOREGROUND_MAX_DISTANCE_MPC`), so on
 * descent the true-scale bodies and star backdrop appear first, the captions
 * later.
 */
export const DESCENT_ONSET_MPC = 1e-3;
