/**
 * Where the asteroids are drawn, by camera distance from the Sun in AU: full well outside the Kuiper
 * belt (~50 AU), so the distant class still reads at full strength from far out. The catalog row loads
 * and releases at multiples of `goneBeyondAu` (`asteroidsAssetRows`).
 */
export const ASTEROID_FADES = {
  fullWithinAu: 200,
  goneBeyondAu: 2_000,
} as const;
