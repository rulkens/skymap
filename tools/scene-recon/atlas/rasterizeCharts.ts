/**
 * The conservative raster both bakes share: per destination triangle, walk its texel bbox and
 * visit any texel whose centre is inside it or within `EDGE_MARGIN_PX` (half a texel diagonal) of
 * an edge, so bilinear sampling never reads an unwritten border texel. Source coordinates come
 * from inverting the triangle's chart placement, not barycentric interpolation — the placement is
 * one transform shared by the whole chart, so every triangle of a chart agrees exactly.
 */
import { ATLAS_CLAIM } from './atlasClaims';
import { rotateTurns } from './rotateTurns';
import type { ChartPlacement } from '../@types/ChartPlacement';
import type { PackedAtlas } from '../@types/PackedAtlas';
import type { Turns } from '../@types/Turns';
import type { Vec2 } from '../../../src/@types/math/Vec2';

const EDGE_MARGIN_PX = Math.SQRT1_2;

export function rasterizeCharts(
  packed: PackedAtlas,
  placements: readonly ChartPlacement[],
  destSizePx: number,
  visit: (destIndex: number, srcXPx: number, srcYPx: number) => void,
): Int32Array {
  const claims = new Int32Array(destSizePx * destSizePx).fill(ATLAS_CLAIM.free);

  for (let t = 0; t < packed.indices.length; t += 3) {
    const va = packed.vertices[packed.indices[t]!]!;
    const vb = packed.vertices[packed.indices[t + 1]!]!;
    const vc = packed.vertices[packed.indices[t + 2]!]!;
    if (va.chartIndex < 0 || vb.chartIndex < 0 || vc.chartIndex < 0) continue; // orphan face

    const chartIndex = va.chartIndex;
    const placement = placements[chartIndex]!;
    const invTurns = ((4 - placement.turns) % 4) as Turns;
    const dest: readonly Vec2[] = [va.uvPx, vb.uvPx, vc.uvPx];

    const xs = dest.map((d) => d[0]);
    const ys = dest.map((d) => d[1]);
    const minX = Math.max(0, Math.floor(Math.min(...xs) - EDGE_MARGIN_PX));
    const maxX = Math.min(destSizePx - 1, Math.ceil(Math.max(...xs) + EDGE_MARGIN_PX));
    const minY = Math.max(0, Math.floor(Math.min(...ys) - EDGE_MARGIN_PX));
    const maxY = Math.min(destSizePx - 1, Math.ceil(Math.max(...ys) + EDGE_MARGIN_PX));

    // Winding sign makes the per-edge inside-test work whichever way this triangle is wound.
    const area2 =
      (dest[1]![0] - dest[0]![0]) * (dest[2]![1] - dest[0]![1]) -
      (dest[1]![1] - dest[0]![1]) * (dest[2]![0] - dest[0]![0]);
    const winding = area2 >= 0 ? 1 : -1;

    for (let dy = minY; dy <= maxY; dy++) {
      for (let dx = minX; dx <= maxX; dx++) {
        const cx = dx + 0.5;
        const cy = dy + 0.5;

        let inside = true;
        for (let e = 0; e < 3 && inside; e++) {
          const a = dest[e]!;
          const b = dest[(e + 1) % 3]!;
          const ex = b[0] - a[0];
          const ey = b[1] - a[1];
          const len = Math.hypot(ex, ey);
          if (len === 0) continue;
          const signedDist = (winding * (ex * (cy - a[1]) - ey * (cx - a[0]))) / len;
          if (signedDist < -EDGE_MARGIN_PX) inside = false;
        }
        if (!inside) continue;

        const destIndex = dy * destSizePx + dx;
        const existing = claims[destIndex]!;
        // packCharts's `padding: 2` gap absorbs chartPlacements' ≤0.5px offset rounding, so this never fires.
        if (existing >= 0 && existing !== chartIndex) {
          throw new Error(
            `rasterizeCharts: texel ${destIndex} claimed by both chart ${existing} and chart ${chartIndex}`,
          );
        }
        claims[destIndex] = chartIndex;

        // Inverse of `d = R·M·s + offset`, so the mirror undoes AFTER the turn, not before.
        const [sx, sy] = rotateTurns(
          [cx - placement.offsetPx[0], cy - placement.offsetPx[1]],
          invTurns,
        );
        visit(destIndex, (placement.mirrorX ? -sx : sx) / placement.scale, sy / placement.scale);
      }
    }
  }

  return claims;
}
