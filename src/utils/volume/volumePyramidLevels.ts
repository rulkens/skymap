import type { VolumePyramidLevel } from '../../@types/data/volume/VolumePyramidLevel';
import type { VolumePyramidSidecar } from '../../@types/data/volume/VolumePyramidSidecar';
import { TEXTURE_BYTES_PER_TEXEL } from '../../data/gpu/textureBytesPerTexel';
import { levelByteLength } from '../gpu/memory/levelByteLength';

/** Levels base first (finest). The loader fetches them in reverse, coarse to fine. */
export function volumePyramidLevels(
  sidecar: VolumePyramidSidecar,
  baseLevel: 1 | 2,
  gpuFormat: GPUTextureFormat,
): readonly VolumePyramidLevel[] {
  const bytesPerTexel = TEXTURE_BYTES_PER_TEXEL[gpuFormat];
  if (bytesPerTexel === undefined) throw new Error(`volumePyramidLevels: no size for ${gpuFormat}`);
  const levels: VolumePyramidLevel[] = [];
  for (let level = baseLevel; level <= 3; level++) {
    const [x, y, z] = sidecar.dataBox.dims;
    const dims: [number, number, number] = [x >> level, y >> level, z >> level];
    levels.push({
      level: level as 1 | 2 | 3,
      mip: level - baseLevel,
      dims,
      byteLength: levelByteLength(dims[0], dims[1], dims[2], bytesPerTexel),
    });
  }
  return levels;
}
