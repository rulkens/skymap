/**
 * flattenUncoveredNormals — set RGBA normal texels whose height cell had no data
 * to the flat normal, in place. `fillEquirectNodata` only keeps the height
 * continuous; its diffusion of ragged coverage edges bakes streaks into the
 * gradient, so the uncovered area must carry no relief at all.
 */
export function flattenUncoveredNormals(rgba: Uint8Array, covered: Uint8Array): void {
  for (let i = 0; i < covered.length; i++) {
    if (covered[i]) continue;
    rgba[i * 4] = 128;
    rgba[i * 4 + 1] = 128;
  }
}
