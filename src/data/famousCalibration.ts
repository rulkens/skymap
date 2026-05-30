/**
 * Shared constant for famous-galaxy thumbnail calibration.
 *
 * Single source of truth for the deprojection threshold so the curator
 * seed, the build-pipeline guard, and any runtime check all agree.
 */

/**
 * Minimum disk axis ratio (b/a) eligible for deprojection.  Below this the
 * galaxy is more inclined than ~70°, where stretching the minor axis back
 * to face-on smears the texture beyond recovery — so the curator seeds the
 * deproject toggle off and the pipeline refuses to stretch even when
 * forced, shipping the thumbnail as-shot instead.  Tunable against real
 * images.
 */
export const DEPROJECT_MIN_AXIS_RATIO = 0.3;
