import { ASTEROID_FORMAT } from './asteroidFormat';

/**
 * Logical data paths of the asteroid files: `build-asteroids` writes them, the manifest hashes them and
 * the Layer fetches the first two together. The `v<N>/` folder follows the ASTB
 * version, as every family's does (docs/DATA.md). The header carries MPC's redistribution terms.
 */
const DIR = `asteroids/v${ASTEROID_FORMAT.version}`;

export const ASTEROID_CATALOG_PATHS = {
  catalog: `${DIR}/asteroids.astb`,
  names: `${DIR}/asteroid-names.bin`,
  header: `${DIR}/mpcorb-header.txt`,
} as const;
