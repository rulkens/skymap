/**
 * Mat3 — flat, mutable, column-major 3×3 matrix tuple used for rotations.
 *
 * Column-major matches:
 *
 *   - gl-matrix (every `mat3.*` operation reads / writes column-major);
 *   - WebGPU / WGSL (the spec stores `mat3x3<f32>` as columns of
 *     `vec3<f32>`);
 *   - GLSL (the historical convention from which both the above derive).
 *
 * Mutable by default — many of our renderer-internal accumulator
 * matrices are filled in place.  Consumers that want read-only access
 * wrap with `Readonly<Mat3>` at the boundary.
 *
 * Column-major index map:  cell at row r, column c is at `m[c*3 + r]`.
 *
 * ### Why not a branded type?
 *
 * Branding (`Mat3 = [...] & { __order: 'column' }`) would force every
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
