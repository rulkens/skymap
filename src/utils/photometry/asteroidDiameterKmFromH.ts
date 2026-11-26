/**
 * asteroidDiameterKmFromH — D = 1329 km / √p · 10^(−H/5), the standard diameter of a body of absolute
 * magnitude H and geometric albedo p (Fowler & Chillemi 1992; 1329 km is the diameter at H = 0, p = 1,
 * from the Sun's V magnitude). The albedo is unknown for most asteroids, so a caller brackets it.
 */
export function asteroidDiameterKmFromH(h: number, albedo: number): number {
  return (1329 / Math.sqrt(albedo)) * 10 ** (-h / 5);
}
