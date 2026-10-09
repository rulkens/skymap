/**
 * encounterBlendWeight — how much of the DE441-consistent craft position replaces Horizons'
 * Sun-chain one at `dtDays` from an encounter: 1 within ±20 d, 0 beyond ±120 d, a cosine taper
 * between (zero slope at both ends, so the correction fades without a kink).
 */

export const BLEND_FULL_DAYS = 20;
export const BLEND_END_DAYS = 120;

export function encounterBlendWeight(dtDays: number): number {
  const a = Math.abs(dtDays);
  if (a <= BLEND_FULL_DAYS) return 1;
  if (a >= BLEND_END_DAYS) return 0;
  return (
    0.5 * (1 + Math.cos((Math.PI * (a - BLEND_FULL_DAYS)) / (BLEND_END_DAYS - BLEND_FULL_DAYS)))
  );
}
