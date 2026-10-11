/** A decoded column: dequantised `q0 + raw·q1` as f32 for scalar stores; packed vectors stay raw (`u10x3` → Uint16Array ×3, `u16x3` → Uint16Array ×3); `u64` → BigUint64Array. */
export type OctreeColumn = Float32Array | Uint16Array | BigUint64Array;
