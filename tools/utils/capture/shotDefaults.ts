/**
 * The knobs a shot is taken with: how big it is rendered, how hard it is
 * compressed, and how long the scene is given to settle between steps.
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

/** Clearing the focus re-settles the camera; this is that settle. */
export const POST_ESC_WAIT_MS = 1500;

/**
 * Fraction of the frame's half-height a computed pose gives the subject's disc.
 * Only poses derived from a body's own size honour it — a curator's hand-framed
 * pose is a distance, and may well sit closer than the body's bounding sphere.
 */
export const SUBJECT_FILL = 0.55;
