/**
 * trueReliefNormalGain — the `bakeNormalMap` gain that reproduces a DEM's real
 * slopes: height range over texel size. The texel is the equatorial one; the
 * bake does not correct toward the poles.
 */

export function trueReliefNormalGain(
  heightRangeKm: number,
  equatorialRadiusM: number,
  gridWidth: number,
): number {
  const texelKm = (2 * Math.PI * (equatorialRadiusM / 1000)) / gridWidth;
  return heightRangeKm / texelKm;
}
