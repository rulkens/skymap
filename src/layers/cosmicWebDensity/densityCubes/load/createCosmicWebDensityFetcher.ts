/**
 * createCosmicWebDensityFetcher — one fetcher for every density cube:
 * `<binBaseName>[-<tier>].scfd` under the scalar-field prefix, loaded straight into a texture on
 * `device`. A 404 surfaces as a commit that never fires, so a missing optional cube draws nothing.
 */

import type { Fetcher } from '../../../../@types/loading/Fetcher';
import type { GpuVolume } from '../../../../@types/rendering/GpuVolume';
import type { CosmicWebDensityReq } from '../@types/CosmicWebDensityReq';
import { loadScfdVolume } from '../../../../services/loading/volume/loadScfdVolume';

export function createCosmicWebDensityFetcher(
  device: GPUDevice,
): Fetcher<GpuVolume, CosmicWebDensityReq> {
  return (req, signal, onProgress) => {
    const stem = req.tier === undefined ? req.binBaseName : `${req.binBaseName}-${req.tier}`;
    return loadScfdVolume(device, stem, signal, onProgress);
  };
}
