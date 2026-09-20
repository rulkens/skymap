/**
 * starCullSlack — px constants the star-catalog CPU cull's angular slack is
 * sized from, each a WESL twin (parity-tested). Independent of
 * `DEFAULT_STAR_SIZE_PX` (`data/defaults.ts`), which only seeds the slider.
 * The cull slack is sized off the glow FLOOR, never `STAR_GLOW_MAX_PX` — a
 * false cull would wink a visible star out, and over-keeping is free.
 */

/** Reference star-dot size in px — the shader's `sizePx` divisor. WESL twin. */
export const STAR_SIZE_REF_PX = 2.5;

/** Legibility floor for a point source in px, at the reference size. WESL twin. */
export const STAR_GLOW_MIN_PX = 1.5;

/** The pick pass's clickable floor in px (a 7 px footprint). WESL twin. */
export const STAR_PICK_MIN_RADIUS_PX = 3.5;
