/**
 * Where the asteroids are drawn, by camera distance from the Sun in AU: full out to about three times
 * the Jupiter trojans' 5.2 AU, gone by 50 AU (owner, 2026-11-16; the old 60 → 200 AU was sized for a
 * Kuiper belt class). The catalog row loads and releases at multiples of `goneBeyondAu`
 * (`asteroidsAssetRows`).
 */
export const ASTEROID_FADES = {
  fullWithinAu: 15,
  goneBeyondAu: 50,
} as const;
