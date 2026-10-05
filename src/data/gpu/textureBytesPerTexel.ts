/**
 * textureBytesPerTexel — bytes-per-texel for every `GPUTextureFormat` the repo
 * creates (grepped `format: '...'` across `src/`), used by `textureByteSize`
 * to size a texture for the GPU-memory ledger. `depth24plus`'s true backing
 * size is driver-defined (commonly padded to 32 bits); 4 is the same
 * conservative count `depth24plus-stencil8` gets, per the ledger's design.
 */
export const TEXTURE_BYTES_PER_TEXEL: Readonly<Partial<Record<GPUTextureFormat, number>>> = {
  rgba8unorm: 4,
  'rgba8unorm-srgb': 4,
  bgra8unorm: 4,
  'bgra8unorm-srgb': 4,
  rgba16float: 8,
  rgba32float: 16,
  r32uint: 4,
  r32float: 4,
  rg32float: 8,
  rg16float: 4,
  r16float: 2,
  r8unorm: 1,
  rg8unorm: 2,
  depth32float: 4,
  depth24plus: 4,
  'depth24plus-stencil8': 4,
  r16uint: 2,
  rgba16uint: 8,
  rgba32uint: 16,
};
