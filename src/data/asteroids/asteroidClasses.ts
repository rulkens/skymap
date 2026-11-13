import type { AsteroidClass } from '../../@types/asteroids/AsteroidClass';

/** Index = the class code in `asteroids.astb` flags bits 0–2; append only, or every published file misreads. */
export const ASTEROID_CLASSES = [
  'nearEarth',
  'mainBelt',
  'hilda',
  'jupiterTrojan',
] as const satisfies readonly AsteroidClass[];
