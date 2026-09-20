/**
 * The knobs a curator actually tunes: how big a shot is and how hard it is
 * compressed. Timeouts stay private to the step that waits — nobody tunes those.
 */

/** Rendered square; big enough that the downscale hides aliasing. */
export const VIEWPORT = { width: 900, height: 900 };

// A grid card is ~101 CSS px wide (560px panel, minus border/padding/gaps over
// 5 columns) — 204 is ×2 for retina.
export const OUTPUT_PX = 204;

/** The famous-curator's setting; lands ~10-20 KB. */
export const WEBP_QUALITY = 82;

/** Past this, a shot is probably framed on noise rather than on its subject. */
export const WARN_BYTES = 40 * 1024;
