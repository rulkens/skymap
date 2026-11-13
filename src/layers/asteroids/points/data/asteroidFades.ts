/**
 * Where the asteroids are drawn, by camera distance from the Sun in AU: full out past the distant class
 * (~50–100 AU), gone by the time the whole catalog is a few pixels that would read as a blob. The
 * catalog row loads and releases at multiples of `goneBeyondAu` (`asteroidsAssetRows`).
 */
export const ASTEROID_FADES = {
  fullWithinAu: 60,
  goneBeyondAu: 200,
} as const;
