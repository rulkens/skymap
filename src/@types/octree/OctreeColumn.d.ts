/** A decoded column: dequantised `q0 + raw·q1` as f32 for scalar stores; packed `u16x3` vectors stay raw (Uint16Array ×3). */
export type OctreeColumn = Float32Array | Uint16Array;
