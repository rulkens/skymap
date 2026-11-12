/** asteroidNamesSlot — the names file, held raw: only the palette search reads it. */
import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { dataUrl, fetchWithProgress } from '../../../../services/loading/fetchWithProgress';
import { ASTEROID_CATALOG_PATHS } from '../../../../data/asteroids/asteroidCatalogPaths';

export function createAsteroidNamesSlot(): AssetSlot<ArrayBuffer, void> {
  return createAssetSlot({
    name: 'asteroidNames',
    fetch: (_req, signal, onProgress) =>
      fetchWithProgress(dataUrl(ASTEROID_CATALOG_PATHS.names), signal, onProgress),
  });
}
