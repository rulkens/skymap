/**
 * NFW lens LUT grid constants — the single source of truth for the grid
 * dimensions and axis ranges passed to `buildNfwLensLut` at startup.
 *
 * 256 x 64 follows the spec (Part 1 line 132): 256 columns along the y-axis
 * give sub-percent interpolation error across the typical source-separation
 * range; 64 rows along the s-axis, combined with the log-like s-mapping in
 * `buildNfwLensLut`, give dense coverage in the weak-lensing regime where
 * most skymap galaxies live, while still reaching the caustic at sMax.
 *
 * yMax = 3.0 covers sources up to 3 scale-radii from the lens centre.
 * Beyond that the deflection is sub-pixel for every realistic cluster in the
 * skymap strength range.
 *
 * sMax = 3.0 matches the calibration note in buildNfwLensLut's docblock:
 * 'a starting value of sMax = 3 covers the caustic for most clusters
 * reachable in the skymap strength range; tune after visual smoke-testing.'
 * The GPU sampler clamps out-of-range queries to the edge row, so a query
 * with s > sMax degrades gracefully to the max-strength row rather than
 * sampling garbage.
 *
 * These four constants are imported by `initGpu` (which calls
 * `buildNfwLensLut`) and may be read by any debug overlay that wants to
 * describe the LUT dimensions to the user.
 */

/** Number of columns in the LUT (resolution along the y / source-separation axis). */
export const NFW_LUT_WIDTH = 256;

/** Number of rows in the LUT (resolution along the s / reduced-strength axis). */
export const NFW_LUT_HEIGHT = 64;

/**
 * Maximum source angular separation in scale-radius units.
 * The y-axis spans [0, yMax] linearly across NFW_LUT_WIDTH columns.
 */
export const NFW_LUT_Y_MAX = 3.0;

/**
 * Maximum reduced lensing strength.
 * The s-axis spans [0, sMax] on the log-like curve defined in
 * buildNfwLensLut across NFW_LUT_HEIGHT rows.
 */
export const NFW_LUT_S_MAX = 3.0;
