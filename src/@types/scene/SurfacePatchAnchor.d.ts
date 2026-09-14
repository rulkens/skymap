/**
 * SurfacePatchAnchor — a surface patch's angular footprint: the corner the
 * template mesh is rooted at, plus its span. `lat0Rad` names the SOUTH edge
 * because mesh `v` increases north while tile rows count south — the flip
 * `cutSurfaceTiles` already applies to reach `v0`.
 *
 * `lon0Rad`/`lat0Rad` are the f32 half of the CPU/GPU contract (spec §7.1):
 * the CPU derives the patch's f64 eye-relative origin from their `Math.fround`
 * values, so the shader's frame and the CPU's origin name the same corner.
 */
export type SurfacePatchAnchor = {
  /** Longitude of the patch's u0 edge, radians; 0 on +X, +π/2 on +Y. */
  readonly lon0Rad: number;
  /** Latitude of the patch's v0 (SOUTH) edge, radians. */
  readonly lat0Rad: number;
  /** Longitude span, radians, always > 0. */
  readonly dLonRad: number;
  /** Latitude span, radians, always > 0. */
  readonly dLatRad: number;
};
