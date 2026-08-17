/**
 * `GalaxyIsmMapOrientation.data` packs `(cos2theta, sin2theta)` already
 * SCALED by coherence per texel — so the packed vector's own length IS the
 * coherence; no separate normalisation or division is needed.
 */
export function orientationCoherenceStats(data: Float32Array): { mean: number; max: number } {
  const texelCount = data.length / 2;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < texelCount; i++) {
    const coherence = Math.hypot(data[i * 2]!, data[i * 2 + 1]!);
    sum += coherence;
    if (coherence > max) max = coherence;
  }
  return { mean: texelCount > 0 ? sum / texelCount : 0, max };
}
