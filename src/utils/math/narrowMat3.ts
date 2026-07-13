/**
 * narrowMat3 — convert a 3×3 matrix from f64 to f32 at the GPU-upload boundary.
 *
 * The 3×3 sibling of `narrowMat4`.  Same single responsibility, same reason to
 * exist: the CPU composes in double precision and narrows exactly once, right
 * before `writeBuffer`, so no intermediate value is ever forced through f32.
 *
 * ### Why narrow only at the boundary?
 *
 * The screen-space conic pipeline composes an orbit's plane basis through the
 * slab's `f64` view-projection and inverts the resulting homography — a chain
 * where the large view-projection translation nearly cancels the tiny
 * origin-relative orbit centre (~1e-12 Mpc).  That cancellation only survives
 * at double precision, so every step up to and including the 3×3 inversion runs
 * in `mat3d`.  WebGPU shaders read f32, so we narrow once at the very end; doing
 * it any earlier would discard the low-order bits the whole `f64` chain exists
 * to preserve.
 *
 * ### The 12-element padded layout
 *
 * A `mat3x3<f32>` in WGSL is std140-aligned: each of the three columns occupies
 * a vec4 slot, so a 3×3 is stored as **12** floats — three columns of three
 * values each, with a padding lane after every column:
 *
 *     [ c0.x c0.y c0.z _pad | c1.x c1.y c1.z _pad | c2.x c2.y c2.z _pad ]
 *        0    1    2    3       4    5    6    7       8    9    10   11
 *
 * wgpu-matrix's `mat3d` uses exactly this padded layout, so narrowing is again
 * just a length-preserving `Float32Array` copy: the padding lanes narrow along
 * with the data (they are zero) and the column offsets are unchanged.  Each f64
 * element coerces to the nearest f32, relative error at most `2^-24`.
 *
 * @param m  A 3×3 matrix as a `Float64Array` of length 12 (column-major, each
 *           column padded to a vec4 lane — the `mat3d` / std140 layout).
 * @returns  The same matrix as a `Float32Array` of length 12, narrowed to f32.
 */
export function narrowMat3(m: Float64Array): Float32Array {
  return new Float32Array(m);
}
