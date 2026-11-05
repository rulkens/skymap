import type { Vec3 } from '../../../src/@types/math/Vec3';

/** One GLB's merged, body-frame geometry as `buildMeshes` bakes it. */
export type Geometry = {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly tangents: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly boundingRadiusM: number;
  readonly groundOffsetM: number;
  /** The area-weighted centroid `mergeGeometry` subtracted, body frame — the
   *  contact decal shifts by the same amount rather than recomputing it. */
  readonly centroidM: Vec3;
};
