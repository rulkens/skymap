import type { AsteroidCatalog } from './AsteroidCatalog';
import type { AsteroidDiameters } from './AsteroidDiameters';
import type { AsteroidNames } from './AsteroidNames';

/** The catalog slot's committed value: the files land together, so a row is never placed without its name or size. */
export type LoadedAsteroids = {
  readonly catalog: AsteroidCatalog;
  readonly names: AsteroidNames;
  readonly diameters: AsteroidDiameters;
};
