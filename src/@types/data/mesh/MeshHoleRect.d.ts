/** The lat/lon rect a georeferenced mesh's baked `<key>_hole.webp` terrain
 *  mask covers — `buildMeshes` emits it from `rasterizeHoleMask`'s ENU rect,
 *  converted through the mesh's own site. Degrees, radians at the point of
 *  use (the surface-tile shader's uniform). */
export type MeshHoleRect = {
  readonly lonMinDeg: number;
  readonly latMinDeg: number;
  readonly lonSpanDeg: number;
  readonly latSpanDeg: number;
};
