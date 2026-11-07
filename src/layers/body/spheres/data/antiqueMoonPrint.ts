/** The antique Moon pass (`moon-print`, `texturedBody/fragment.wesl` `fsMoonPrint`):
 * its crater rings and the uniform record it loops over. */

/** The rings one frame prints, most: the full disc needs ~60, a close-up's cut
 * leaves 150–300 candidates, and the largest are the ones a reader names. */
export const ANTIQUE_MOON_MAX_CRATERS = 128;

/** A rim prints from this apparent diameter (print units), at full weight by the
 * second: below it the highlands turn to a field of bubbles. Mirrored as
 * `RIM_MIN_UNITS`/`RIM_FULL_UNITS` in `fsMoonPrint`. */
export const ANTIQUE_MOON_RIM_UNITS = [20, 32] as const;

/** A crater is evaluated out to this many radii from its centre (rim line + flank). */
export const ANTIQUE_MOON_RIM_REACH = 1.35;

/** `MoonPrint` in `texturedBody/fragment.wesl`: a 16-byte header, then two vec4 per crater. */
export const ANTIQUE_MOON_PRINT_BYTES = 16 + ANTIQUE_MOON_MAX_CRATERS * 32;

/** The sphere the crater bake measured arcs on (LOLA's reference radius): its km
 * radii turn back into arcs on this, not on the drawn datum. */
export const ANTIQUE_MOON_TABLE_RADIUS_KM = 1737.4;
