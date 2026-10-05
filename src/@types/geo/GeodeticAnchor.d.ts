/**
 * GeodeticAnchor — a real-world point a georeferenced mesh source's own
 * origin sits at, before `buildMeshes` shifts the mesh onto its
 * `SurfaceFixedSite`. `heightM` is on the HOST terrain's own datum (DVR90 on
 * Earth), not an ellipsoidal height — it needs no geoid shift to compare
 * against the app's DHM terrain.
 */
export type GeodeticAnchor = {
  readonly latDeg: number;
  readonly lonDeg: number;
  readonly heightM: number;
};
