/**
 * packCameraUniforms — the 112-byte camera UBO packer, extracted from the
 * spike's frame loop at `galaxy-engine.js:287-292` and matching the WGSL
 * `struct Cam { viewProj: mat4x4<f32>, right: vec4<f32>, up: vec4<f32>,
 * params: vec4<f32> }` at `galaxy-shaders.js:7-12`.
 *
 * `viewProj` alone is enough to place a vertex in clip space, but the
 * star/dust shaders don't draw plain points — each instance is a
 * screen-facing billboard quad, so the vertex shader needs the camera's
 * *world-space* right/up axes to expand a point into a quad that always
 * faces the camera (`world = inPos + (right * corner.x + up * corner.y) *
 * size`, per `galaxy-shaders.js:28`). Re-deriving that basis on the GPU
 * from `viewProj` would mean inverting a projected matrix per-vertex;
 * cheaper to compute it once per frame on the CPU and ride it along in the
 * same UBO the vertex shader already binds.
 *
 * The view matrix already contains that basis, just transposed. `lookAt`
 * builds a view matrix whose rotation block's *rows* are the camera's
 * right/up/back axes expressed in world space (the standard change-of-basis
 * construction: the matrix that rotates world space into camera space has
 * the camera's world-space basis vectors as its rows, because rotation
 * matrices are orthonormal and their inverse — world-to-camera here — is
 * their transpose). wgpu-matrix stores `mat4` column-major, so those rows
 * are read with a stride-4 gather: `view[0], view[4], view[8]` is row 0
 * (right), `view[1], view[5], view[9]` is row 1 (up). No inverse or
 * transpose call needed — just index arithmetic into the matrix we already
 * computed for `viewProj`.
 */

/**
 * Pack the camera UBO: `viewProj` (floats 0-15), world-space right/up axes
 * read off the view matrix's rotation rows (floats 16-23), and the
 * size/intensity/LOD/cull params (floats 24-27).
 *
 * @param viewProj Combined view-projection matrix, 16 floats column-major.
 * @param view     View matrix, 16 floats column-major — right/up are read
 *                 from its rotation rows.
 * @param args     Per-frame render params packed verbatim into floats 24-27.
 * @param dst      Optional destination (28 floats); written in place and
 *                 returned when given, following the wgpu-matrix dst-last
 *                 idiom. A fresh `Float32Array(28)` is allocated otherwise.
 * @returns The packed 28-float (112-byte) camera UBO.
 */
export function packCameraUniforms(
  viewProj: Float32Array,
  view: Float32Array,
  args: {
    readonly sizeScale: number;
    readonly starIntensity: number;
    readonly lodApparent: number;
    readonly cullBright: number;
  },
  dst?: Float32Array,
): Float32Array {
  const out = dst ?? new Float32Array(28);
  out.set(viewProj, 0);
  // `view` is a fixed 16-float column-major Mat4, so these indices are
  // provably in bounds — non-null assertion per the project's
  // noUncheckedIndexedAccess convention (see matrixToQuaternion.ts).
  out.set([view[0]!, view[4]!, view[8]!, 0], 16); // world-space right
  out.set([view[1]!, view[5]!, view[9]!, 0], 20); // world-space up
  out.set([args.sizeScale, args.starIntensity, args.lodApparent, args.cullBright], 24);
  return out;
}
