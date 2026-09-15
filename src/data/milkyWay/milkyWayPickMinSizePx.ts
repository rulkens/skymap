/**
 * milkyWayPickMinSizePx — the floor the Milky Way pick billboard's apparent
 * half-extent never falls below, so the galactic centre stays clickable from
 * intergalactic distances. A scene constant riding the pick renderer's static
 * `@group(2)` uniform, not a camera or settings fact.
 */

/**
 * Minimum apparent half-extent (px) of the Milky Way pick billboard. A
 * literal on purpose: it reproduces what the galaxy size slider's default
 * (2.5 px) plus `PICK_PADDING_PX` (4) used to give, but the Milky Way's hit
 * target is a property of the Milky Way, not of the galaxy point knob — a
 * moved slider, or a moved default, must not resize it.
 */
export const MILKY_WAY_PICK_MIN_SIZE_PX = 6.5;
