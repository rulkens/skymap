/**
 * asteroidsSlot — the catalog's asset slot. It fetches the names and diameters files beside the
 * catalog (a few percent of its size each), so a linked asteroid's card is named and sized with no
 * palette open; both are read as views on the main thread, no decode to speak of. The committed
 * catalog is the decoded one, so the GPU upload and the CPU mirror read the same columns; commit
 * uploads the solver's rows and release destroys them.
 */
import type { AssetSlot } from '../../../../../packages/shared/src/@types/loading/AssetSlot';
import type { AsteroidCatalog } from '../@types/AsteroidCatalog';
import type { LoadedAsteroids } from '../@types/LoadedAsteroids';
import type { AsteroidKeplerSolver } from '../../kepler/@types/AsteroidKeplerSolver';
import { createAssetSlot } from '../../../../../packages/shared/src/services/loading/AssetSlot';
import {
  dataUrl,
  fetchWithProgress,
} from '../../../../../packages/shared/src/services/loading/fetchWithProgress';
import { runDisposableWorker } from '../../../../utils/worker/runDisposableWorker';
import { ASTEROID_CATALOG_PATHS } from '../../../../data/asteroids/asteroidCatalogPaths';
import { parseAsteroidDiameters } from './parseAsteroidDiameters';
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
      const [catalog, names, diameters] = await Promise.all([
        decodeCatalog(),
        // The catalog alone drives the progress bar: three streams would fight over one meter.
        fetchWithProgress(dataUrl(ASTEROID_CATALOG_PATHS.names), signal, () => {}).then(
          parseAsteroidNames,
        ),
        fetchWithProgress(dataUrl(ASTEROID_CATALOG_PATHS.diameters), signal, () => {}).then(
          parseAsteroidDiameters,
        ),
      ]);
      return { catalog, names, diameters };
    },
    commit: async ({ catalog }) => {
      solver.upload(catalog);
    },
    onRelease: () => solver.clear(),
  });
}
