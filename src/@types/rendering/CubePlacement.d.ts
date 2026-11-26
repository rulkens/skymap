/**
 * CubePlacement — the minimal geometry needed to place an N³ voxel cube into
 * skymap world space.
 *
 * The model-matrix math (`buildCubeModelMatrix`) is shared by every cube layer:
 * the scalar-volume overlay (`GpuVolume.placement`) and the flow field (whose
 * `FlowFieldMeta` derives from a `ScalarCube`), so the builder takes this narrow
 * structural type. A `ScalarCube` satisfies it too, but a volume load copies the
 * five fields into a fresh object: holding the cube would keep its voxels alive.
 * The flow renderer constructs one from `FlowFieldMeta` + an identity rotation
 * (flow cubes ship axis-aligned, so their per-cube rotation is the identity).
 */
import type { Vec3 } from '../math/Vec3';
import type { Vec4 } from '../math/Vec4';
import type { ScalarFieldFrameKind } from '../data/volume/ScalarFieldFrameKind';

export type CubePlacement = {
  /** Coordinate frame the cube lives in; mapped to world by the builder. */
  readonly frameKind: ScalarFieldFrameKind;
  /** Unit quaternion (x, y, z, w) applied in the native frame. */
  readonly rotation: Vec4;
  /** Position of the voxel (0,0,0) corner in `frameKind` coords, Mpc. */
  readonly origin: Vec3;
  /** Edge length of one cubic voxel, Mpc. */
  readonly voxelSize: number;
  /** Voxels per axis (the cube is `dims[0] × dims[1] × dims[2]`). */
  readonly dims: Vec3;
};
