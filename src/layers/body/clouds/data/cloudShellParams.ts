/**
 * cloudShellParams: the tunable dials of the cloud shell above Earth's surface,
 * shared by `cloudShellPass`, `earthPass` and both uniform packers (the surface
 * casts the deck's shadow from the same `radiusRatio`).
 *
 * The fade band is calibrated against `cutSurfaceTiles`: a level settles at
 * altitude `h(z) = pi * R * H / (2^z * 2*tilePx * tan(fovY/2))`. With R = 6371 km,
 * `DEFAULT_FOV_Y_RAD` = 60 deg, `SURFACE_TILE_PX` = 512, H = 900 px: z6 = 476 km
 * (0.075 R, fade start), z7 = 238 km. `h` scales with H, so the band is a look dial.
 */

export const CLOUD_SHELL_PARAMS: {
  /** Shell radius in unit-sphere local units: 1 + 12.7 km cloud tops / 6371 km. */
  readonly radiusRatio: number;
  /** Coverage-to-alpha multiplier into the shell's straight-alpha output. */
  readonly opacity: number;
  /** Altitude (body radii above the surface) where the descent fade begins. */
  readonly fadeStartAltitudeRadii: number;
  /** Altitude where it completes: ~3.2 km, inside the shell radius (0.002), so the deck stays visible through the inside-the-shell descent. */
  readonly fadeEndAltitudeRadii: number;
} = {
  radiusRatio: 1.002,
  opacity: 1.0,
  fadeStartAltitudeRadii: 0.075,
  fadeEndAltitudeRadii: 0.0005,
};
