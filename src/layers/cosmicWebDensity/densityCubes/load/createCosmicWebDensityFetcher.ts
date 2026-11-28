/**
 * createCosmicWebDensityFetcher — one fetcher for every density cube, loaded straight into
 * textures on `device`: a `volume-pyramid/v1/` pyramid, or one `<binBaseName>.scfd`. A 404
 * surfaces as a commit that never fires, so a missing optional cube draws nothing.
 */

import type { Fetcher } from '../../../../../packages/shared/src/@types/loading/Fetcher';
import type { GpuVolume } from '../../../../@types/rendering/GpuVolume';
import type { CosmicWebDensityReq } from '../@types/CosmicWebDensityReq';
import { loadScfdVolume } from '../../../../services/loading/volume/loadScfdVolume';
import { loadVolumePyramid } from '../../../../services/loading/volume/loadVolumePyramid';

const LOAD_BY_STORAGE: {
  [S in CosmicWebDensityReq['storage']]: (
    device: GPUDevice,
    req: Extract<CosmicWebDensityReq, { storage: S }>,
    signal: AbortSignal,
    onProgress: (loaded: number, total: number) => void,
  ) => Promise<GpuVolume>;
} = {
  pyramid: loadVolumePyramid,
  scfd: (device, req, signal, onProgress) =>
    loadScfdVolume(device, req.binBaseName, signal, onProgress),
};

function load<S extends CosmicWebDensityReq['storage']>(
  device: GPUDevice,
  req: Extract<CosmicWebDensityReq, { storage: S }>,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<GpuVolume> {
  return LOAD_BY_STORAGE[req.storage](device, req, signal, onProgress);
}

export function createCosmicWebDensityFetcher(
  device: GPUDevice,
): Fetcher<GpuVolume, CosmicWebDensityReq> {
  return (req, signal, onProgress) => load(device, req, signal, onProgress);
}
