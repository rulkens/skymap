/**
 * A decoded column: dequantised `q0 + raw·q1` as f32 for scalar stores, f64 for `u32` (past 2^24);
 * packed `u16x3` vectors stay raw (Uint16Array ×3); `u64` ids stay raw as a BigUint64Array, since
 * a pgc can pass 2^53.
 */
export type OctreeColumn = Float32Array | Float64Array | Uint16Array | BigUint64Array;
