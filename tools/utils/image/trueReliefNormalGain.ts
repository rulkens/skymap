/**
 * trueReliefNormalGain — the `bakeNormalMap` gain that reproduces a DEM's real
 * slopes. `toByteScale` maps the height range to 0..255 and the bake divides by
 * 255, so the baked height is (h - min) / range in texel units; true slope is
 * heightRangeKm per texelKm, hence gain = range / texel. The texel size is the
 * equatorial one: the bake does not shrink it toward the poles.
 */

export function trueReliefNormalGain(
  heightRangeKm: number,
  equatorialRadiusM: number,
  gridWidth: number,
): number {
  const texelKm = (2 * Math.PI * (equatorialRadiusM / 1000)) / gridWidth;
  return heightRangeKm / texelKm;
}
