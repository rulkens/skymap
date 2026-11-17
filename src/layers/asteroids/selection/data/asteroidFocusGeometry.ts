/**
 * How the camera frames a followed asteroid. It draws as a dot of fixed pixel size and most are a
 * few km across, so the footprint frames the million km around it: near enough that the dot leads
 * the view and its orbit ring runs through it, far enough that it moves visibly against the stars.
 */
export const ASTEROID_FOCUS_GEOMETRY = {
  boundingRadiusM: 10_000,
  footprintRadiusM: 1e9,
  standoffRadii: 2,
} as const;
