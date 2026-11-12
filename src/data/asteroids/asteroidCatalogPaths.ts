/**
 * Logical data paths of the asteroid files: `build-asteroids` writes them, the manifest hashes them and
 * the Layer fetches them. The names file loads on its own, on the first search.
 */
export const ASTEROID_CATALOG_PATHS = {
  catalog: 'asteroids/asteroids.astb',
  names: 'asteroids/asteroid-names.bin',
} as const;
