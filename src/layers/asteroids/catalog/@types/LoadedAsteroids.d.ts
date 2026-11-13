import type { AsteroidCatalog } from './AsteroidCatalog';
import type { AsteroidNames } from './AsteroidNames';

/** The catalog slot's committed value: both files land together, so a row is never placed without its name. */
export type LoadedAsteroids = {
  readonly catalog: AsteroidCatalog;
  readonly names: AsteroidNames;
};
