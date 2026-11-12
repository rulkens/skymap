/**
 * asteroidsSlot — the catalog's asset slot. Its committed value is the decoded catalog, so the GPU
 * upload and the CPU mirror read the same columns, and release drops them.
 */
import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { AsteroidCatalog } from '../@types/AsteroidCatalog';
import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { dataUrl, fetchWithProgress } from '../../../../services/loading/fetchWithProgress';
import { runDisposableWorker } from '../../../../utils/worker/runDisposableWorker';
import { ASTEROID_CATALOG_PATHS } from '../../../../data/asteroids/asteroidCatalogPaths';

export function createAsteroidsSlot(
  DecodeWorker: new () => Worker,
): AssetSlot<AsteroidCatalog, void> {
  return createAssetSlot({
    name: 'asteroids',
    fetch: async (_req, signal, onProgress) => {
      const file = await fetchWithProgress(
        dataUrl(ASTEROID_CATALOG_PATHS.catalog),
        signal,
        onProgress,
      );
      return runDisposableWorker<ArrayBuffer, AsteroidCatalog>(
        DecodeWorker,
        file,
        [file],
        'asteroid-catalog',
      );
    },
  });
}
