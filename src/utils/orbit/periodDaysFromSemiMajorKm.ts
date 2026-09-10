/**
 * periodDaysFromSemiMajorKm — Kepler's third law against Earth's GM, for a
 * geocentric row with no JPL period column to transcribe (the whale/petunias
 * 400 km circular orbit; every other satellite row's `periodDays` comes
 * straight from JPL sats/elem instead).
 *
 * T = 2π√(a³ / GM). GM = 398600.4418 km³/s² is the EGM2008 / WGS84 value, the
 * standard geodesy constant for Earth.
 */

const EARTH_GM_KM3_S2 = 398600.4418;
const SECONDS_PER_DAY = 86400;

export function periodDaysFromSemiMajorKm(semiMajorKm: number): number {
  const periodSeconds = 2 * Math.PI * Math.sqrt(semiMajorKm ** 3 / EARTH_GM_KM3_S2);
  return periodSeconds / SECONDS_PER_DAY;
}
