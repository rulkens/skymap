/**
 * loadScfdVolume — one `.scfd` under the scalar-field prefix into a `GpuVolume`. The decoded cube
 * is garbage once this returns: only the texture and a copied placement leave.
 */

import type { GpuVolume } from '../../../@types/rendering/GpuVolume';
import {
  decodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../../data/volume/scalarFieldFormat';
import { gpuTextureFormatForChannels } from '../../../utils/gpu/gpuTextureFormatForChannels';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

/** `stem` is the file name under the scalar-field prefix, without `.scfd`. */
export async function loadScfdVolume(
  device: GPUDevice,
  stem: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<GpuVolume> {
  const buf = await fetchWithProgress(
    dataUrl(`${SCALAR_FIELD_DATA_PREFIX}/${stem}.scfd`),
    signal,
    onProgress,
  );
  const cube = decodeScalarField(buf);
  const [width, height, depthOrArrayLayers] = cube.dims;
  const size = { width, height, depthOrArrayLayers };
  const texture = device.createTexture({
    label: `density-volume-${stem}`,
    size,
    format: gpuTextureFormatForChannels(cube.channels),
    dimension: '3d',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // f16 voxels: 2 bytes per channel.
  device.queue.writeTexture(
    { texture },
    cube.voxels,
    { bytesPerRow: width * 2 * cube.channels, rowsPerImage: height },
    size,
  );
  // A ScalarCube satisfies CubePlacement, but handing it over would keep its voxels alive.
  const { frameKind, rotation, origin, voxelSize, dims } = cube;
  return { texture, placement: { frameKind, rotation, origin, voxelSize, dims } };
}
