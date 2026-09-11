/**
 * glintBandClass — a glint body's PICK PRIORITY class, the per-instance datum
 * that decides which pick-depth band the body forces in `starPointPick.wesl`'s
 * `vsGlint` entry.
 *
 * ### The three classes (0 earth, 1 planet, 2 moon)
 *
 * At glint scale a planet and its moons stack inside each other's ~18 px pick
 * footprints, so a click must resolve to the IMPORTANT body, not the nearest
 * one. The shader ranks glints by class: Earth beats every planet, a planet
 * beats its moons. This function is the single place that maps a body id to that
 * class, so the priority is DATA (an unconditional depth win per class), not the
 * fragile instance-draw-order tie-break an earlier design leaned on.
 *
 *   - `0` (earth)  — the Earth glint stamp. Earth is heliocentric like the
 *     planets, so it cannot be told apart from them by orbital elements; its
 *     class-0 status is a property of it being the descent's focus body, so it
 *     is special-cased here rather than derived.
 *   - `1` (planet) — a heliocentric major planet (`focusId === 'sun'`).
 *   - `2` (moon)   — a satellite (`focusId` names its parent planet).
 *
 * Classified by the body's position-driver host (`bodyHostId`: an orbit's
 * focus, a surface site's host), NOT a hardcoded id list — a new moon or a
 * rover on Mars classifies correctly for free, and a body with no orbital row
 * does not throw.
 *
 * ### Contract with the shader
 *
 * The returned integer is written raw into the glint instance's `bandClass`
 * attribute and read by `vsGlint`, whose `GLINT_CLASS_EARTH / GLINT_CLASS_PLANET`
 * comparison chain must stay in step with these values (0 earth, 1 planet, 2
 * moon). The three integers are single-sourced on the WESL side as
 * `lib/pickDepthBands`'s `GLINT_CLASS_*` and here as the exported constants
 * below; a parity test pins the two so a renumbering on one side without the
 * other is caught (it would silently mis-map a body to the wrong priority band,
 * with no compile error).
 */

import { bodyHostId } from '../../../../data/bodies/positionDrivers';

/** Glint priority class — the Earth stamp (the descent's focus body). Shallowest band. */
export const GLINT_CLASS_EARTH = 0;
/** Glint priority class — a heliocentric major planet (`focusId === 'sun'`). */
export const GLINT_CLASS_PLANET = 1;
/** Glint priority class — a satellite (a moon; `focusId` names its parent). Deepest band. */
export const GLINT_CLASS_MOON = 2;

export function glintBandClass(bodyId: string): number {
  // the focus body — class earth, not derivable from elements
  if (bodyId === 'earth') return GLINT_CLASS_EARTH;
  // heliocentric (planet, probe) : hanging off a planet (moon, rover)
  return bodyHostId(bodyId) === 'sun' ? GLINT_CLASS_PLANET : GLINT_CLASS_MOON;
}
