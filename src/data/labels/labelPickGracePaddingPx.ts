/**
 * Grace margin, in CSS px (times pxScale), added on every side of a label's measured ink rect before it is
 * stamped into the pick target, so a click that lands just off a glyph still
 * selects the thing the name points at. Sibling in spirit to
 * `LABEL_DECLUTTER_PAD_PX`: the same breathing room, applied to the
 * hit box instead of the collision test.
 *
 * It does NOT guarantee disjoint pick rects: declutter only keeps its pad BETWEEN
 * two accepted rects, so two grace boxes can overlap by up to the pad.
 * Overlaps resolve by the nearest-subject-first order `recordPickQuads` emits.
 */
export const LABEL_PICK_GRACE_PADDING_PX = 4;
