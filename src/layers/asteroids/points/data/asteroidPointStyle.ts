/**
 * The dots' screen size, half-extents in px. The dot is the stars' point-source floor (a lone record
 * stays visible); the pick footprint is wider, since a 1.5 px target can't be hit with a mouse.
 */
export const ASTEROID_POINT_STYLE = {
  dotRadiusPx: 1.25,
  pickRadiusPx: 6,
} as const;
