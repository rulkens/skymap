/** One vertex of a map polyline: geodetic degrees, arc km from the strip's start,
 * line width in print units there. */
export type BakedStripPoint = {
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly arcKm: number;
  readonly widthUnits: number;
};
