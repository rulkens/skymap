import { ASTEROID_FOCUS_PREFIX } from './asteroidFocusPrefix';

/** encodeAsteroidFocusId — an asteroid's deep-link focus id, the one spelling the URL and the palette share. */
export function encodeAsteroidFocusId(number: number): string {
  return `${ASTEROID_FOCUS_PREFIX}${number}`;
}
