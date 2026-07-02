/**
 * makeWarpOffset — the galactic-warp vertical offset. Extracted from the
 * spike's inline `warpOffset` closure at `galaxy-model.js:141-151`.
 *
 * Real spiral disks aren't flat plates: beyond some radius the disk bends
 * out of the midplane into an integral-sign (S) shape, and the line where
 * the disk crosses back through the midplane (the "line of nodes")
 * precesses with radius, so the outer disk reads as twisted rather than
 * simply tilted. That's exactly what Cepheid distance/position mapping
 * shows for the real Milky Way's outer disk. The offset is zero inside
 * `warpStart` so the flat, dynamically distinct bulge and bar are
 * untouched — only the outer disk/arm/dust population warps.
 */
import type { GalaxyParams } from '../../@types/model/GalaxyParams';

/**
 * Build a vertical-offset function for a given galaxy's warp knobs.
 *
 * @param params      Warp knobs: `warpStrength` (0 disables the warp
 *                    entirely), `warpTwist` (node-line precession rate per
 *                    unit `rel`), `warpStart` (fraction of `outerRadius`
 *                    inside which the disk stays flat; defaults to 0.3).
 * @param outerRadius The disk's outer radius, in the same units as the
 *                    `x`/`z` the returned function is called with.
 * @returns A `(x, z) -> y offset` function for a disk/arm/dust point.
 */
export function makeWarpOffset(
  params: GalaxyParams,
  outerRadius: number,
): (x: number, z: number) => number {
  const warpStrength = params.warpStrength ?? 0;
  const warpTwist = params.warpTwist ?? 0;
  const start = outerRadius * (params.warpStart ?? 0.3);

  return (x: number, z: number): number => {
    if (warpStrength <= 0) return 0;
    const rr = Math.hypot(x, z);
    if (rr <= start) return 0;
    const rel = (rr - start) / Math.max(1e-4, outerRadius - start);
    const node = warpTwist * rel; // line of nodes precesses with radius
    return warpStrength * outerRadius * 0.4 * rel * rel * Math.sin(Math.atan2(z, x) - node);
  };
}
