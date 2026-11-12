/**
 * The dots' screen size, half-extents in px. The dot is the stars' point-source floor (a lone record
 * stays visible); the pick footprint is wider, since a 1.5 px target can't be hit with a mouse. The
 * selected (or followed) dot is wider still: its orbit ring runs through it in the same tint, and a
 * point-source dot sinks into the ring's line.
 */
export const ASTEROID_POINT_STYLE = {
  dotRadiusPx: 1.25,
  pickRadiusPx: 6,
  selectedRadiusPx: 8,
} as const;
