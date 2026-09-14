/**
 * Glint pick-priority classes — the per-instance datum `starPointPick.wesl`'s
 * `vsGlint` ranks glints by, so a click where a planet and its moons stack
 * inside each other's ~18 px pick footprints resolves to the IMPORTANT body.
 * An unconditional depth win per class, not the fragile instance-draw-order
 * tie-break an earlier design leaned on.
 *
 * Single-sourced on the WESL side as `lib/pickDepthBands`'s `GLINT_CLASS_*`;
 * a parity test pins the two, since renumbering one side alone would silently
 * mis-map a body to the wrong band with no compile error.
 */

/** The Earth glint stamp (the descent's focus body). Shallowest band. */
export const GLINT_CLASS_EARTH = 0;
/** A heliocentric major planet (`focusId === 'sun'`). */
export const GLINT_CLASS_PLANET = 1;
/** A satellite (a moon; `focusId` names its parent planet). Deepest band. */
export const GLINT_CLASS_MOON = 2;
