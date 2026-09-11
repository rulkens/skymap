/**
 * glintBandClass — a glint body's PICK PRIORITY class, the per-instance datum
 * that decides which pick-depth band the body forces in `starPointPick.wesl`'s
 * `vsGlint` entry. At glint scale a planet and its moons stack inside each
 * other's ~18 px pick footprints, so a click must resolve to the important body.
 * Classified by the body's position-driver host (`bodyHostId`), not an id list,
 * so a new moon or a rover on Mars classifies for free; Earth is special-cased
 * because it is heliocentric like the planets and so cannot be told apart from
 * them by elements.
 *
 * Contract with the shader: the returned integer is written raw into the glint
 * instance's `bandClass` attribute and read by `vsGlint`, whose
 * `GLINT_CLASS_EARTH / GLINT_CLASS_PLANET` comparison chain must stay in step
 * with these values. They are single-sourced on the WESL side as
 * `lib/pickDepthBands`'s `GLINT_CLASS_*` and here as the constants below; a
 * parity test pins the two, because renumbering one side alone would silently
 * mis-map a body to the wrong band with no compile error.
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
