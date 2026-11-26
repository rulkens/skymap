/**
 * loadVolumePyramid — a volume pyramid into one `GpuVolume`: the sidecar, one texture in the best
 * format the device takes, then the level files coarse to fine, each streamed through one reused
 * slab. Each level's writes pass their error checks before the next level is fetched, so a failed
 * write stops the download and no frame samples a level still being filled; on any error, abort
 * included, the texture is destroyed. Spec:
 * `docs/superpowers/specs/2026-11-26-volume-halfres-compressed-cubes-design.md` §6.
 */

import type { VolumePyramidRequest } from '../../../@types/data/volume/VolumePyramidRequest';
import type { VolumePyramidSidecar } from '../../../@types/data/volume/VolumePyramidSidecar';
import type { GpuVolume } from '../../../@types/rendering/GpuVolume';
import { TEXTURE_BYTES_PER_TEXEL } from '../../../data/gpu/textureBytesPerTexel';
import { VOLUME_PYRAMID_DATA_PREFIX } from '../../../data/volume/volumePyramidDataPrefix';
import { VOLUME_UPLOAD_SLAB_BYTES } from '../../../data/volume/volumeUploadSlabBytes';
import { levelByteLength } from '../../../utils/gpu/memory/levelByteLength';
import { scopedGpuCall } from '../../../utils/gpu/scopedGpuCall';
import { pickVolumePyramidFormat } from '../../../utils/volume/pickVolumePyramidFormat';
import { streamLevelSlabs } from '../../../utils/volume/streamLevelSlabs';
import { volumePyramidLevelPath } from '../../../utils/volume/volumePyramidLevelPath';
import { volumePyramidLevels } from '../../../utils/volume/volumePyramidLevels';
import { volumePyramidPlacement } from '../../../utils/volume/volumePyramidPlacement';
import { dataUrl, HttpError } from '../fetchWithProgress';

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
      // Dawn clears a whole 3D level through one staging buffer before its first partial write;
      // the largest (MCPM r8 L1, 62.7 MB) fits the default 256 MiB maxBufferSize.
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
    const slab = new Uint8Array(VOLUME_UPLOAD_SLAB_BYTES);
    let loaded = 0;
    for (const { level, mip, dims } of [...levels].reverse()) {
      const url = dataUrl(volumePyramidLevelPath(binBaseName, format, level));
      const res = await fetch(url, { signal });
      if (!res.ok) {
        void res.body?.cancel();
        throw new HttpError(res.status, url);
      }
      if (!res.body) throw new Error(`loadVolumePyramid: no body streams from ${url}`);
      const [w, h, depth] = dims;
      // A row of blocks: blockEdge texel rows, one block deep.
      const layout = {
        bytesPerRow: levelByteLength(w, blockEdge, 1, bytesPerTexel),
        rowsPerImage: h / blockEdge,
      };
      const writeChecks: Promise<void>[] = [];
      await streamLevelSlabs(
        res.body.getReader(),
        { sliceBytes: levelByteLength(w, h, 1, bytesPerTexel), depth },
        slab,
        (bytes, z, sliceCount) => {
          const check = scopedGpuCall(device, () =>
            device.queue.writeTexture(
              { texture: target, mipLevel: mip, origin: { x: 0, y: 0, z } },
              bytes,
              layout,
              { width: w, height: h, depthOrArrayLayers: sliceCount },
            ),
          );
          // Handled now, awaited below: a rejection mid-stream must not surface as uncaught.
          check.catch(() => {});
          writeChecks.push(check);
        },
        (byteCount) => onProgress((loaded += byteCount), total),
      );
      // Before the next fetch, so a failed write stops the download.
      await Promise.all(writeChecks);
    }
    return { texture: target, ...volumePyramidPlacement(sidecar, baseLevel) };
  } catch (error) {
    texture?.destroy();
    throw error;
  }
}
