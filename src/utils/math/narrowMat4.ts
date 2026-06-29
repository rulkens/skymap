/**
 * narrowMat4 — convert a 4×4 matrix from f64 to f32 at the GPU-upload boundary.
 *
 * ### Why narrow only at the boundary?
 *
 * The camera transformation pipeline composes matrices using wgpu-matrix's `mat4d`
 * (double-precision). This gives us maximum fidelity during intermediate
 * calculations — things like view-matrix inversion and combined projection chains
 * accumulate rounding errors, and those errors are smallest when we compute in
 * the highest precision available.
 *
 * However, GPUs (WebGPU shaders, WGSL) work natively in f32. A matrix stored in
 * a uniform or storage buffer must be f32 anyway, so we narrow once at the upload
 * boundary — after all composition, right before `writeBuffer`. Narrowing earlier
 * would force intermediate values through f32 precision and lose the benefit of
 * the high-precision pipeline.
 *
 * ### The conversion
 *
 * This function constructs a new `Float32Array` from a `Float64Array` of 16
 * elements (the row-major layout of a 4×4 matrix). The constructor implicitly
 * performs the narrowing: each f64 value is coerced to the nearest representable
 * f32 value. The relative error is at most `2^-24` (f32 machine epsilon), which
 * is acceptable for typical 3D transformations.
 *
 * @param m  A 4×4 matrix as a `Float64Array` of length 16 (row-major).
 * @returns  The same matrix as a `Float32Array` of length 16, narrowed to f32 precision.
 */
export function narrowMat4(m: Float64Array): Float32Array {
  return new Float32Array(m);
}
