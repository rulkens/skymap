/** create — the two slots; the demand loop decides when either loads. */
import type { AsteroidsRuntime } from './@types/AsteroidsRuntime';
import { createAsteroidsSlot } from './catalog/load/asteroidsSlot';
import { createAsteroidNamesSlot } from './catalog/load/asteroidNamesSlot';
import AsteroidCatalogWorker from './catalog/load/parseAsteroidCatalog.worker?worker';

export function create(): AsteroidsRuntime {
  return {
    slot: createAsteroidsSlot(AsteroidCatalogWorker),
    namesSlot: createAsteroidNamesSlot(),
  };
}
