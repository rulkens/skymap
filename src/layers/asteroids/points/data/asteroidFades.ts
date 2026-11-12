/**
 * Where the asteroids are drawn, by camera distance from the Sun in AU. The Layer's visibility band
 * is the outer pair, which only the distant class (TNOs and beyond, out to a few hundred AU) needs;
 * every other class fades on the inner pair, folded into its class fade (`asteroidClassFade`).
 * The catalog row loads and releases at multiples of the outer `goneBeyondAu` (`asteroidsAssetRows`).
 */
export const ASTEROID_FADES = {
  fullWithinAu: 400,
  goneBeyondAu: 1500,
} as const;

/** The distance fade of every class but `distant`: past these they are a few-pixel blob, not a belt. */
export const ASTEROID_INNER_FADES = {
  fullWithinAu: 60,
  goneBeyondAu: 200,
} as const;
