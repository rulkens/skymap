/**
 * flowFieldFromCube — upload an already-decoded velocity cube to the GPU and
 * return its `FlowField` handle.
 *
 * Synchronous (no fetch): the demand-driven flow asset slot fetches the `.scfd`
 * itself through its own progress/abort machinery (`fetchWithProgress`), then
 * hands the decoded `ScalarCube` straight here so the upload needs no second
 * network round-trip.
 *
 * The voxels become an N³ `rgba16float` 3D texture — rgb = velocity (km/s) in
 * the cube's native frame, a = overdensity δ.  The buffer is C-order
 * `[z][y][x][c]` f16 RGBA (x fastest, z outer), exactly the layout WebGPU's
 * `writeTexture` walks with `bytesPerRow = n * 4 channels * 2 bytes` and
 * `rowsPerImage = n`.  The cube's `Uint16Array` holds the raw 2-byte f16
 * representation, so the upload is a straight copy with no per-element
 * conversion.
 */

import type { FlowField } from '../../../@types/data/FlowField';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
import { gpuTextureFormatForChannels } from '../../../data/scalarFieldFormat';
import { flowFieldMetaFromCube } from '../../../data/flowFieldMetaFromCube';

export function flowFieldFromCube(device: GPUDevice, cube: ScalarCube): FlowField {
  const meta = flowFieldMetaFromCube(cube);

  const n = meta.n;
  const texture = device.createTexture({
    size: [n, n, n],
    dimension: '3d',
    format: gpuTextureFormatForChannels(cube.channels),
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // bytesPerRow = n voxels * 4 channels * 2 bytes (f16); rowsPerImage = n.
  device.queue.writeTexture({ texture }, cube.voxels, { bytesPerRow: n * 4 * 2, rowsPerImage: n }, [
    n,
    n,
    n,
  ]);

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  return {
    textureView: texture.createView(),
    sampler,
    meta,
    dispose: () => texture.destroy(),
  };
}
