/**
 * CubePlacement — the minimal geometry needed to place an N³ voxel cube into
 * skymap world space.
 *
 * The model-matrix math (`buildCubeModelMatrix`) is shared by every cube layer:
 * the scalar-volume overlay (`ScalarCube`) and the flow field (whose
 * `FlowFieldMeta` derives from a `ScalarCube`). Rather than privilege one of
 * those richer types as the function's parameter — and force the other to
 * fabricate the fields it lacks — the builder takes this narrow structural
 * type. A `ScalarCube` already satisfies it (it carries every field plus the
 * voxel bytes), so volume call sites pass the cube unchanged; the flow renderer
 * constructs one from `FlowFieldMeta` + an identity rotation (flow cubes ship
 * axis-aligned, so their per-cube rotation is the identity quaternion).
 */
import type { Vec3 } from '../math/Vec3';
import type { Vec4 } from '../math/Vec4';
import type { ScalarFieldFrameKind } from '../data/ScalarFieldFrameKind';

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
