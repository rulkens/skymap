/**
 * Glint pick-priority classes: the per-instance datum `vsGlint` in
 * `starPointPick.wesl` ranks by, so a click on stacked planet and moons resolves
 * to the important body. Single-sourced on the WESL side as `lib/pickDepthBands`'s
 * `GLINT_CLASS_*`; a parity test pins the two.
 */

/** The Earth glint stamp (the descent's focus body). Shallowest band. */
export const GLINT_CLASS_EARTH = 0;
/** A heliocentric major planet (`focusId === 'sun'`). */
export const GLINT_CLASS_PLANET = 1;
/** A satellite (a moon; `focusId` names its parent planet). Deepest band. */
export const GLINT_CLASS_MOON = 2;
