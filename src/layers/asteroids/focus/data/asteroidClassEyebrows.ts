import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';

/** The kind an asteroid's card names above its title. */
export const ASTEROID_CLASS_EYEBROWS: Readonly<Record<AsteroidClass, string>> = {
  nearEarth: 'Near-Earth asteroid',
  mainBelt: 'Main-belt asteroid',
  hilda: 'Hilda asteroid',
  jupiterTrojan: 'Jupiter trojan',
  distant: 'Distant minor planet',
};
