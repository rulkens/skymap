/** The antique Moon pass (`moon-print`, `texturedBody/fragment.wesl` `fsMoonPrint`):
 * its crater rings and the uniform record it loops over. */

/** The body the pass prints. */
export const ANTIQUE_MOON_HOST = 'moon';

/** The rings one frame prints, most: a close-up's budget would ask ~180, bubble wrap,
 * so it is cut here; the full disc asks ~40. */
export const ANTIQUE_MOON_MAX_CRATERS = 40;

/** One ring per this much visible disc, print units² (a 1600×900 frame's px): the
 * reviewers' density for a chart, not a census. */
export const ANTIQUE_MOON_RING_AREA_UNITS = 8000;

/** A rim prints from this apparent diameter (print units), at full weight by the
 * second. Mirrored as `RIM_MIN_UNITS`/`RIM_FULL_UNITS` in `fsMoonPrint`. */
export const ANTIQUE_MOON_RIM_UNITS = [8, 14] as const;

/** A named crater is ringed from this apparent diameter (print units), its name's mark. */
export const ANTIQUE_MOON_NAMED_RIM_UNITS = 3;

/** A crater is evaluated out to this many radii from its centre (rim line + flank). */
export const ANTIQUE_MOON_RIM_REACH = 1.35;

/** `MoonPrint` in `texturedBody/fragment.wesl`: a 16-byte header, then two vec4 per crater. */
export const ANTIQUE_MOON_PRINT_BYTES = 16 + ANTIQUE_MOON_MAX_CRATERS * 32;

/** The sphere the crater bake measured arcs on (LOLA's reference radius): its km
 * radii turn back into arcs on this, not on the drawn datum. */
export const ANTIQUE_MOON_TABLE_RADIUS_KM = 1737.4;

/** The ring's radius over the table's LOLA crest: overlaid on the plain render the crest
 * sits ~15% outside the rim the albedo map shows (Tycho, Clavius and their neighbours,
 * 2026-11-07), and a reader checks the ring against the crater he sees. */
export const ANTIQUE_MOON_RIM_SCALE = 0.86;
