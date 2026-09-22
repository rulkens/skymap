import { TEXTURE_BYTES_PER_TEXEL } from '../../../data/gpu/textureBytesPerTexel';
import { normalizeGpuExtent3D } from './normalizeGpuExtent3D';

// Module-level, not per-call: a format missing from the table warns ONCE across
// the whole session rather than once per texture (which would be every frame
// for a per-frame-recreated offscreen target).
const warnedFormats = new Set<GPUTextureFormat>();
const FALLBACK_BYTES_PER_TEXEL = 4;

/**
 * Sum bytes across every mip level: `'3d'` halves depth per mip (floor, min 1,
 * matching GPU mip-chain rules); `'2d'`'s `depthOrArrayLayers` is array
 * layers, which does NOT shrink per mip — every layer carries its own full
 * mip chain. `sampleCount` multiplies the whole sum (MSAA storage is
 * per-sample, not resolved).
 */
export function textureByteSize(descriptor: GPUTextureDescriptor): number {
  const [width, height, depth] = normalizeGpuExtent3D(descriptor.size);
  const format = descriptor.format;
  let bytesPerTexel = TEXTURE_BYTES_PER_TEXEL[format];
  if (bytesPerTexel === undefined) {
    if (!warnedFormats.has(format)) {
      warnedFormats.add(format);
      console.warn(`textureByteSize: unknown format '${format}', assuming 4 bytes/texel`);
    }
    bytesPerTexel = FALLBACK_BYTES_PER_TEXEL;
  }

  const is3d = descriptor.dimension === '3d';
  const mipLevelCount = descriptor.mipLevelCount ?? 1;
  let w = width;
  let h = height;
  let d = depth;
  let total = 0;
  for (let mip = 0; mip < mipLevelCount; mip++) {
    total += w * h * d * bytesPerTexel;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
    if (is3d) d = Math.max(1, d >> 1);
  }
  return total * (descriptor.sampleCount ?? 1);
}
