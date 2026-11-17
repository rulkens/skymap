/**
 * Grace margin added on every side of a label's measured ink rect before it is
 * stamped into the pick target, so a click that lands just off a glyph still
 * selects the thing the name points at. Sibling in spirit to the COSMO
 * declutter's `declutterPadPx: 8` (both director configs) — the same 8 px of
 * breathing room, applied to the hit box instead of the collision test.
 *
 * It does NOT guarantee disjoint pick rects: declutter only keeps 8 px BETWEEN
 * two accepted rects, so two grace boxes can overlap by up to 8 px.
 * Overlaps resolve by the nearest-subject-first order `labelPickQuads` emits.
 */
export const LABEL_PICK_GRACE_PADDING_PX = 8;
