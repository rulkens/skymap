import type { Vec3 } from '../math/Vec3';

/** glTF-style factors the mesh shader multiplies its baked maps by: linear RGB, then [0, 1] scalars. */
export type MeshMaterialFactors = {
  readonly baseColor: Readonly<Vec3>;
  readonly metallic: number;
  readonly roughness: number;
};
