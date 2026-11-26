/**
 * loadVolumePyramid — a volume pyramid into one `GpuVolume`: the sidecar, one texture in the best
 * format the device takes, then the level files coarse to fine, each held whole for one writeTexture.
 * Peak CPU is about twice the largest level for a moment (MCPM ASTC L1 ≈ 55 MB, r8 ≈ 125 MB), the
 * price of no streaming code; nothing is kept after. Each write passes its error check before the
 * next fetch, so a failed write stops the load and no frame samples a level still being filled; on
 * any error, abort included, the texture is destroyed. Spec:
 * `docs/superpowers/specs/completed/2026-11-26-volume-halfres-compressed-cubes-design.md` §6.
 */

import type { VolumePyramidRequest } from '../../../@types/data/volume/VolumePyramidRequest';
import type { VolumePyramidSidecar } from '../../../@types/data/volume/VolumePyramidSidecar';
import type { GpuVolume } from '../../../@types/rendering/GpuVolume';
import { TEXTURE_BYTES_PER_TEXEL } from '../../../data/gpu/textureBytesPerTexel';
import { VOLUME_PYRAMID_DATA_PREFIX } from '../../../data/volume/volumePyramidDataPrefix';
import { levelByteLength } from '../../../utils/gpu/memory/levelByteLength';
import { scopedGpuCall } from '../../../utils/gpu/scopedGpuCall';
import { pickVolumePyramidFormat } from '../../../utils/volume/pickVolumePyramidFormat';
import { volumePyramidLevelPath } from '../../../utils/volume/volumePyramidLevelPath';
import { volumePyramidLevels } from '../../../utils/volume/volumePyramidLevels';
import { volumePyramidPlacement } from '../../../utils/volume/volumePyramidPlacement';
import {
  dataUrl,
  fetchWithProgress,
  HttpError,
} from '../../../../packages/shared/src/services/loading/fetchWithProgress';

export async function loadVolumePyramid(
  device: GPUDevice,
  req: VolumePyramidRequest,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<GpuVolume> {
  const { binBaseName, baseLevel } = req;
  const sidecarUrl = dataUrl(`${VOLUME_PYRAMID_DATA_PREFIX}/${binBaseName}.json`);
  const sidecarRes = await fetch(sidecarUrl, { signal });
  if (!sidecarRes.ok) throw new HttpError(sidecarRes.status, sidecarUrl);
  const sidecar = (await sidecarRes.json()) as VolumePyramidSidecar;

  const { format, gpuFormat, blockEdge } = pickVolumePyramidFormat(device.features);
  const levels = volumePyramidLevels(sidecar, baseLevel, gpuFormat);
  const bytesPerTexel = TEXTURE_BYTES_PER_TEXEL[gpuFormat]!; // volumePyramidLevels threw otherwise
  const total = levels.reduce((sum, level) => sum + level.byteLength, 0);
  const [width, height, depthOrArrayLayers] = levels[0]!.dims;
  // Assigned in the scoped call's closure, which TS's narrowing cannot see; the cast keeps the union.
  let texture = undefined as GPUTexture | undefined;
  try {
    await scopedGpuCall(device, () => {
      // Each level's one writeTexture stages through one buffer: the largest (MCPM r8 L1,
      // 62.7 MB) fits the default 256 MiB maxBufferSize.
      texture = device.createTexture({
        label: `density-volume-${binBaseName}`,
        size: { width, height, depthOrArrayLayers },
        mipLevelCount: 4 - baseLevel,
        format: gpuFormat,
        dimension: '3d',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
    });
    const target = texture!;
    let done = 0;
    for (const { level, mip, dims, byteLength } of [...levels].reverse()) {
      const url = dataUrl(volumePyramidLevelPath(binBaseName, format, level));
      const bytes = await fetchWithProgress(url, signal, (loaded) =>
        onProgress(done + loaded, total),
      );
      if (bytes.byteLength !== byteLength) {
        throw new Error(
          `loadVolumePyramid: ${url} is ${bytes.byteLength} B, expected ${byteLength}`,
        );
      }
      const [w, h, depth] = dims;
      await scopedGpuCall(device, () =>
        device.queue.writeTexture(
          { texture: target, mipLevel: mip },
          bytes,
          // A compressed copy counts in blocks: a row is one row of blocks, an image h / blockEdge rows.
          {
            bytesPerRow: levelByteLength(w, blockEdge, 1, bytesPerTexel),
            rowsPerImage: h / blockEdge,
          },
          { width: w, height: h, depthOrArrayLayers: depth },
        ),
      );
      done += byteLength;
    }
    return { texture: target, ...volumePyramidPlacement(sidecar, baseLevel) };
  } catch (error) {
    texture?.destroy();
    throw error;
  }
}
