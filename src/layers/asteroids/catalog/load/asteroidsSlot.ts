/**
 * asteroidsSlot — the catalog's asset slot. It fetches the names file beside the catalog (a few
 * percent of its size), so a linked asteroid's card is named with no palette open. The committed
 * catalog is the decoded one, so the GPU upload and the CPU mirror read the same columns; commit
 * uploads the solver's rows and release destroys them.
 */
import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { AsteroidCatalog } from '../@types/AsteroidCatalog';
import type { LoadedAsteroids } from '../@types/LoadedAsteroids';
import type { AsteroidKeplerSolver } from '../../kepler/@types/AsteroidKeplerSolver';
import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { dataUrl, fetchWithProgress } from '../../../../services/loading/fetchWithProgress';
import { runDisposableWorker } from '../../../../utils/worker/runDisposableWorker';
import { ASTEROID_CATALOG_PATHS } from '../../../../data/asteroids/asteroidCatalogPaths';
import { parseAsteroidNames } from './parseAsteroidNames';

export function createAsteroidsSlot(
  DecodeWorker: new () => Worker,
  solver: AsteroidKeplerSolver,
): AssetSlot<LoadedAsteroids, void> {
  return createAssetSlot({
    name: 'asteroids',
    fetch: async (_req, signal, onProgress) => {
      const decodeCatalog = async (): Promise<AsteroidCatalog> => {
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
      };
      const [catalog, names] = await Promise.all([
        decodeCatalog(),
        // The catalog alone drives the progress bar: two streams would fight over one meter.
        fetchWithProgress(dataUrl(ASTEROID_CATALOG_PATHS.names), signal, () => {}).then(
          parseAsteroidNames,
        ),
      ]);
      return { catalog, names };
    },
    commit: async ({ catalog }) => {
      solver.upload(catalog);
    },
    onRelease: () => solver.clear(),
  });
}
