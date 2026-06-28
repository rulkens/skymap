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
import { SG_TO_EQ_MAT4_COL_MAJOR } from '../../data/superGalacticTransform';
import type { ScalarFieldFrameKind } from '../../@types/data/volume/ScalarFieldFrameKind';
import type { CubePlacement } from '../../@types/rendering/CubePlacement';

// Supergalactic→equatorial rotation, J2000.  Imported directly from
// the canonical column-major export in `superGalacticTransform.ts`
// (composed from R_GAL_TO_EQ · R_SG_TO_GAL once at module init).
//
// Why import the canonical mat4 layout rather than reconstruct from
// the 3x3 here: every other path that maps SG → EQ in the codebase
// (cluster labels via `raDecDistToEqCart`, the SCFD header rotation
// quaternion, future renderers) flows through the same 3x3 → derived
// form.  Reconstruction in two places means two opportunities for
// the column-major-vs-row-major transcription to drift; centralising
// the layout decision in `superGalacticTransform.ts` makes drift
// impossible (the renderer never sees the 3x3 form, so it can't
// re-encode it incorrectly).  See that file's docstring on
// `SG_TO_EQ_MAT4_COL_MAJOR` for the rationale and the historical
// drift that prompted the consolidation.
//
// `mat4.create` accepts 16 positional values and returns a `Mat4`
// (`Float32Array(16)`).  `Float32Array.of(...readonly number[])` would work
// too, but the positional form makes the matrix contract explicit at the call
// site.  (wgpu-matrix has no `fromValues`; `create` doubles as both.)
const SG_TO_EQ_ROT = mat4.create(
  SG_TO_EQ_MAT4_COL_MAJOR[0]!,
  SG_TO_EQ_MAT4_COL_MAJOR[1]!,
  SG_TO_EQ_MAT4_COL_MAJOR[2]!,
  SG_TO_EQ_MAT4_COL_MAJOR[3]!,
  SG_TO_EQ_MAT4_COL_MAJOR[4]!,
  SG_TO_EQ_MAT4_COL_MAJOR[5]!,
  SG_TO_EQ_MAT4_COL_MAJOR[6]!,
  SG_TO_EQ_MAT4_COL_MAJOR[7]!,
  SG_TO_EQ_MAT4_COL_MAJOR[8]!,
  SG_TO_EQ_MAT4_COL_MAJOR[9]!,
  SG_TO_EQ_MAT4_COL_MAJOR[10]!,
  SG_TO_EQ_MAT4_COL_MAJOR[11]!,
  SG_TO_EQ_MAT4_COL_MAJOR[12]!,
  SG_TO_EQ_MAT4_COL_MAJOR[13]!,
  SG_TO_EQ_MAT4_COL_MAJOR[14]!,
  SG_TO_EQ_MAT4_COL_MAJOR[15]!,
);

// wgpu-matrix's `mat4.create()` returns a ZERO matrix (unlike gl-matrix's
// identity-returning `create()`), so the no-rotation frames use `mat4.identity()`
// — anything else would zero out the cube transform.
const FRAME_TO_WORLD: Record<ScalarFieldFrameKind, Mat4> = {
  'supergalactic-cartesian': SG_TO_EQ_ROT,
  'equatorial-cartesian': mat4.identity(),
  galactic: mat4.identity(),
};

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
