// Single-sourced: encodeStep's uniform write must agree with the buffer createGridBuffers
// allocates byte-for-byte, or the write silently disagrees with the buffer it targets.
export const UNIFORM_BYTES = 64; // McpmUniforms: 16 x 4-byte scalars, no padding (io.wesl)
