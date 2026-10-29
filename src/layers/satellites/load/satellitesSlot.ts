/**
 * satellitesSlot — the catalog's asset slot. Its committed value is the file, and committing it is
 * what starts the SGP4 worker; releasing it terminates the worker and frees the GPU instances, so
 * the demand loop's load/release edges are the worker's whole lifetime.
 */
import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { dataUrl, fetchWithProgress } from '../../../services/loading/fetchWithProgress';
import { SATELLITE_CATALOG_PATH } from '../../../data/satellites/satelliteCatalogPath';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { SatellitePointRenderer } from '../@types/SatellitePointRenderer';
import type { SatellitePropagator } from '../@types/SatellitePropagator';

export function createSatellitesSlot(
  propagator: SatellitePropagator,
  renderer: SatellitePointRenderer,
): AssetSlot<ArrayBuffer, void> {
  return createAssetSlot({
    name: 'satellites',
    fetch: (_req, signal, onProgress) =>
      fetchWithProgress(dataUrl(SATELLITE_CATALOG_PATH), signal, onProgress),
    commit: (file) => propagator.start(file),
    onRelease: () => {
      propagator.stop();
      renderer.clear();
    },
  });
}
