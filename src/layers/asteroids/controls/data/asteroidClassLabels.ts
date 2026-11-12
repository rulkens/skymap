import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';

/** How each class reads in the Settings section. */
export const ASTEROID_CLASS_LABELS: Readonly<Record<AsteroidClass, string>> = {
  nearEarth: 'Near-Earth asteroids',
  mainBelt: 'Main belt',
  hilda: 'Hildas',
  jupiterTrojan: 'Jupiter trojans',
  distant: 'Distant objects',
};
