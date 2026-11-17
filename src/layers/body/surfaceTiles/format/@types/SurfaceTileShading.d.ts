/**
 * SurfaceTileShading — the per-body PBR dials a `SurfaceTileSpec` row
 * supplies to its fragment, so a bare body (no material/night/cloud maps)
 * still picks its own roughness/Fresnel/irradiance rather than inheriting
 * Earth's `EARTH_SURFACE_PARAMS` by default.
 */
export type SurfaceTileShading = {
  readonly roughnessBase: number;
  readonly f0: number;
  readonly sunIrradiance: number;
};
