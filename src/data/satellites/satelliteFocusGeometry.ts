/**
 * How the camera frames a followed satellite. A satellite draws as a dot of fixed pixel size, so
 * its own few metres say nothing about framing: the footprint frames the ~50 km around it, close
 * enough to see it move against Earth and far enough that the gap between the dot (extrapolated
 * from the last sweep) and the followed point (SGP4 every frame), under 70 m, cannot show.
 */
export const SATELLITE_FOCUS_GEOMETRY = {
  boundingRadiusM: 50,
  footprintRadiusM: 50_000,
  standoffRadii: 2,
} as const;
