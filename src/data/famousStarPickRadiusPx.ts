/**
 * famousStarPickRadiusPx — the click footprint `bodyPickRenderer` expands each
 * scene-star pick billboard to, in screen pixels.
 *
 * The authoritative value is the WESL twin `FAMOUS_STAR_PICK_RADIUS_PX` in
 * `bodies/starPointPick.wesl`, which is what actually rasterises the footprint;
 * `?static` linking injects no values, so this is a hand-written mirror pinned
 * by a parity test (the same discipline `glintBandClass` keeps for its band
 * classes).
 *
 * It is mirrored here because one CPU-side decision needs the footprint's SIZE:
 * a star closer to its own anchor than this radius is inside the anchor's click
 * target and cannot be aimed at separately, so `starPointsLayer` drops its stamp
 * rather than let it steal the anchor's click.
 */

/** Radius in px of a scene star's clickable footprint (18 px across). */
export const FAMOUS_STAR_PICK_RADIUS_PX = 9;
