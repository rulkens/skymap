/**
 * buildCubeModelMatrix — the shared cube-placement math for every voxel-cube
 * layer (scalar-volume overlay + flow field).
 *
 * Maps the unit cube `[0,1]³` (the vertex shaders' input space) to the cube's
 * footprint in skymap world space. It lives in its own module — rather than
 * inside `volumeFieldRenderer` — because two renderers depend on it, and a
 * renderer importing from a sibling renderer would couple their teardown and
 * load order for no reason. Both consume this neutral helper instead.
 *
 * The parameter is the narrow `CubePlacement` structural type, not a whole
 * `ScalarCube`: a `ScalarCube` satisfies it directly (so volume call sites pass
 * the cube unchanged), and the flow renderer builds one from `FlowFieldMeta` +
 * an identity rotation. See `CubePlacement` for that rationale.
 */
import { mat4, type Mat4 } from 'wgpu-matrix';
import { FRAME_TO_WORLD } from '../../data/frameToWorld';
import type { CubePlacement } from '../../@types/rendering/CubePlacement';

// Composition order, applied right-to-left to a unit-cube corner v:
//
//   1. scale  by (Nx*voxelSize, Ny*voxelSize, Nz*voxelSize) — unit cube
//      becomes its physical extent (e.g. [0, 1000]^3 for CF-4)
//   2. translate by the cube's origin in its native frame — shifts the
//      cube so its corner sits at `origin`, which for an observer-centered
//      cube means the cube's geometric centre lands at the native frame's
//      origin
//   3. rotate by the cube's per-cube quaternion — pivots around the
//      native frame's origin, which (after step 2) coincides with the
//      cube's centre.  Order matters: rotating BEFORE the translate
//      would pivot around the cube's corner instead and offset the
//      whole volume by `R*origin - origin` in the native frame.  The
//      synthetic cubes (and flow) ship identity rotations, so the bug is
//      invisible there; CF-4 (with the SG→EQ quaternion) exposes it.
//   4. transform from the native frame into world space
//
// Pure math, no GPU device — unit-testable on its own (see
// `tests/utils/math/buildCubeModelMatrix.test.ts`).
export function buildCubeModelMatrix(cube: CubePlacement): Mat4 {
  // wgpu-matrix ops take the destination as an optional LAST arg and return it.
  const out = mat4.copy(FRAME_TO_WORLD[cube.frameKind]);
  const rotMat = mat4.fromQuat([
    cube.rotation[0],
    cube.rotation[1],
    cube.rotation[2],
    cube.rotation[3],
  ]);
  mat4.multiply(out, rotMat, out);
  mat4.translate(out, [cube.origin[0], cube.origin[1], cube.origin[2]], out);
  const sx = cube.dims[0] * cube.voxelSize;
  const sy = cube.dims[1] * cube.voxelSize;
  const sz = cube.dims[2] * cube.voxelSize;
  mat4.scale(out, [sx, sy, sz], out);
  return out;
}
