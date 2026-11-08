/** The antique Moon pass (`moon-print`, `texturedBody/fragment.wesl` `fsMoonPrint`):
 * its crater rings and the uniform record it loops over. */

/** The body the pass prints. */
export const ANTIQUE_MOON_HOST = 'moon';

/** The rings one frame prints, most: the full disc asks ~60, the census of a period plate. */
export const ANTIQUE_MOON_MAX_CRATERS = 60;

/** A close-up's ring cap as the visible disc fills the frame over `fill` (share of its
 * area): its area budget would ask ~180, bubble wrap. */
export const ANTIQUE_MOON_CLOSE_CRATERS = { count: 40, fill: [0.3, 0.8] } as const;

/** One ring per this much visible disc, print units² (a 1600×900 frame's px): the
 * reviewers' density for a chart, not a census. */
export const ANTIQUE_MOON_RING_AREA_UNITS = 5200;

/** A rim prints from this apparent diameter (print units), at full weight by the
 * second. Mirrored as `RIM_MIN_UNITS`/`RIM_FULL_UNITS` in `fsMoonPrint`. */
export const ANTIQUE_MOON_RIM_UNITS = [8, 14] as const;

/** A named crater is ringed from this apparent diameter (print units), its name's mark. */
export const ANTIQUE_MOON_NAMED_RIM_UNITS = 3;

/** A crater on a named crater's floor keeps its ring (Clavius' chain) when its radius is at
 * most [0] of the named one's and it lies wholly within [1] of that radius. */
export const ANTIQUE_MOON_FLOOR_CRATER = [0.3, 0.85] as const;

/** A crater is evaluated out to this many radii from its centre (rim line + flank). */
export const ANTIQUE_MOON_RIM_REACH = 1.35;

/** A named crater's mark reaches at least this far (cosine of the arc, ~110 km). Mirrored
 * as `NAMED_REACH_COS` in `fsMoonPrint`. */
export const ANTIQUE_MOON_NAMED_REACH_COS = 0.998;

/** A sea crater's blanket (`ANTIQUE_MOON_SEA_CRATERS`) fades out over these radii.
 * Mirrored as `BLANKET` in `fsMoonPrint`. */
export const ANTIQUE_MOON_BLANKET = [2.5, 7] as const;

/** A rayed crater (curated weight over 1) prints its ejecta blanket as radial stipple
 * from its rim out to [1] radii, densest within [0]. Mirrored as `EJECTA` in `fsMoonPrint`. */
export const ANTIQUE_MOON_EJECTA = [1.4, 2.4] as const;

/** The frame's tiles (columns, rows): each lists the rings that can reach it, so a pixel
 * loops over a few rings, not all of them (`binMoonCraters`). Mirrored in `fsMoonPrint`. */
export const ANTIQUE_MOON_TILES = [16, 9] as const;

/** `MoonPrint` in `texturedBody/fragment.wesl`, read by both Moon passes: a 32-byte
 * header, two vec4 per crater, then two u32 of ring mask per tile. */
export const ANTIQUE_MOON_PRINT_BYTES =
  32 + ANTIQUE_MOON_MAX_CRATERS * 32 + ANTIQUE_MOON_TILES[0] * ANTIQUE_MOON_TILES[1] * 8;

/** The sphere the crater bake measured arcs on (LOLA's reference radius): its km
 * radii turn back into arcs on this, not on the drawn datum. */
export const ANTIQUE_MOON_TABLE_RADIUS_KM = 1737.4;

/** The ring's radius over the table's LOLA crest: overlaid on the plain render the crest
 * sits ~15% outside the rim the albedo map shows (Tycho, Clavius and their neighbours,
 * 2026-11-07), and a reader checks the ring against the crater he sees. */
export const ANTIQUE_MOON_RIM_SCALE = 0.86;
