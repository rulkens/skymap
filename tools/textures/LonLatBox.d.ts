/**
 * LonLatBox — an axis-aligned geographic box in degrees: the sampling unit an
 * `EarthImagerySource` is handed.
 *
 * Degrees rather than radians because every imagery source in play addresses
 * itself in degrees — EPSG:4326 GeoTIFF corner coordinates, WMTS lon/lat
 * bounds, the WorldCover 1-degree tile names. A radian box would be converted
 * back inside every implementation instead of once, at the single caller that
 * builds it from a tile index.
 *
 * Four named edges rather than an origin plus a size: an imagery source's own
 * metadata is stated as corners, so the conversion at each implementation is a
 * direct substitution rather than an addition that can be got backwards. It
 * also makes `north > south` readable at a glance, which matters because the
 * pyramid's `y` axis runs the other way (tile `y = 0` is the NORTH row).
 *
 * **No box ever crosses the antimeridian.** The tile grid starts at longitude
 * -180 and its column edges divide 360 exactly, so `west < east` always holds
 * and a source implementation is a plain rectangle read with no wrap case. The
 * antimeridian wrap exists exactly once in this feature, in the runtime's
 * page-table window arithmetic, where it is a single modulo.
 */
export type LonLatBox = {
  /** Western edge, degrees in [-180, 180]. Always strictly less than `east`. */
  readonly west: number;
  /** Eastern edge, degrees in [-180, 180]. */
  readonly east: number;
  /** Southern edge, degrees in [-90, 90]. Always strictly less than `north`. */
  readonly south: number;
  /** Northern edge, degrees in [-90, 90]. */
  readonly north: number;
};
