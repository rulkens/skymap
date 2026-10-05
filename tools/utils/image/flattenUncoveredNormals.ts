/**
 * flattenUncoveredNormals — set RGBA normal texels with no height data to the
 * flat normal, in place. Hole-filling diffusion bakes streaks into the gradient.
 */
export function flattenUncoveredNormals(rgba: Uint8Array, covered: Uint8Array): void {
  for (let i = 0; i < covered.length; i++) {
    if (covered[i]) continue;
    rgba[i * 4] = 128;
    rgba[i * 4 + 1] = 128;
  }
}
