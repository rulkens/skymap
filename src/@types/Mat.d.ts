/**
 * Mat3/Mat4 — flat, mutable, number-tuple aliases for the only two
 * matrix shapes this project uses: 3×3 rotations and 4×4 model/view
 * matrices.  Both are **column-major** by convention, matching:
 *
 *   - gl-matrix (every `mat3.*` / `mat4.*` operation reads / writes
 *     column-major);
 *   - WebGPU / WGSL (the spec stores `mat3x3<f32>` and `mat4x4<f32>`
 *     as columns of `vec3<f32>` / `vec4<f32>`);
 *   - GLSL (the historical convention from which both the above derive).
 *
 * Like Vec*, mutable by default: gl-matrix's `mat4` is a mutable
 * Float32Array, and many of our renderer-internal accumulator matrices
 * are filled in place.  Consumers that want read-only access wrap
 * with `Readonly<Mat4>` at the boundary.
 *
 * ### Column-major index map
 *
 *   Mat3 cell at row r, column c:  m[c*3 + r]
 *   Mat4 cell at row r, column c:  m[c*4 + r]
 *
 * For a Mat4 with translation in the right-most column:
 *
 *   m[ 0]  m[ 4]  m[ 8]  m[12]      r0c0  r0c1  r0c2   tx
 *   m[ 1]  m[ 5]  m[ 9]  m[13]      r1c0  r1c1  r1c2   ty
 *   m[ 2]  m[ 6]  m[10]  m[14]      r2c0  r2c1  r2c2   tz
 *   m[ 3]  m[ 7]  m[11]  m[15]       0     0     0      1
 *
 * ### Why not branded types?
 *
 * Branding (`Mat4 = [...] & { __order: 'column' }`) would force every
 * gl-matrix interop call to cast.  We pay attention to which matrices
 * end up here instead — the convention is enforced by code review and
 * the SG_TO_EQ_MAT4_COL_MAJOR anti-drift tests, not the compiler.
 */

/** 3×3 matrix, column-major (9 elements, mutable). */
export type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

/** 4×4 matrix, column-major (16 elements, mutable). */
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];
