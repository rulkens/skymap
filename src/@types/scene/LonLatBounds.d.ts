/**
 * LonLatBounds — an axis-aligned geographic box in degrees: the sampling unit an
 * `EarthImagerySource` is handed.
 *
 * Degrees, not radians, since every imagery source in play already addresses
 * itself that way. Four named edges, not an origin plus a size, so
 * `north > south` reads at a glance — which matters since the pyramid's `y`
 * axis runs the other way (tile `y = 0` is NORTH).
 *
 * No box ever crosses the antimeridian: the tile grid starts at -180 with
 * column edges dividing 360 exactly, so `west < east` always holds and no
 * source needs a wrap case (that exists once, in the runtime's page-table
 * arithmetic).
 */
export type LonLatBounds = {
  /** Western edge, degrees in [-180, 180]. Always strictly less than `east`. */
  readonly west: number;
  /** Eastern edge, degrees in [-180, 180]. */
  readonly east: number;
  /** Southern edge, degrees in [-90, 90]. Always strictly less than `north`. */
  readonly south: number;
  /** Northern edge, degrees in [-90, 90]. */
  readonly north: number;
};
