import type { ChartPlacement } from '../@types/ChartPlacement';
import type { PackedAtlas } from '../@types/PackedAtlas';
import type { PackedVertex } from '../@types/PackedVertex';
import type { Vec2 } from '../../../src/@types/math/Vec2';

const TURNS = [0, 1, 2, 3] as const;

/** Mathematical CCW rotation by `turns` × 90° — the same convention `rasterizeCharts` inverts. */
function rotate([x, y]: Vec2, turns: (typeof TURNS)[number]): Vec2 {
  switch (turns) {
    case 0:
      return [x, y];
    case 1:
      return [-y, x];
    case 2:
      return [-x, -y];
    default:
      return [y, -x];
  }
}

/** One placement per chart index; xatlas chooses WHERE a chart goes, this snaps HOW it got there
 *  to a 90° turn plus an integer offset, so the bake can invert it exactly. */
export function chartPlacements(
  packed: PackedAtlas,
  sourceUvs: Float32Array, // 0..1
  sourceSizePx: number,
  scale: number,
): ChartPlacement[] {
  const membersByChart: PackedVertex[][] = Array.from({ length: packed.chartCount }, () => []);
  for (const v of packed.vertices) {
    if (v.chartIndex >= 0) membersByChart[v.chartIndex]!.push(v); // orphans get no placement
  }

  return membersByChart.map((members) => {
    const dMin: Vec2 = [Infinity, Infinity];
    for (const v of members) {
      dMin[0] = Math.min(dMin[0], v.uvPx[0]);
      dMin[1] = Math.min(dMin[1], v.uvPx[1]);
    }

    let bestTurns: ChartPlacement['turns'] = 0;
    let bestSpread = Infinity;
    let bestSourceMin: Vec2 = [0, 0];

    for (const turns of TURNS) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let sourceMinX = Infinity;
      let sourceMinY = Infinity;

      for (const v of members) {
        const turned = rotate(
          [
            sourceUvs[2 * v.xref]! * sourceSizePx * scale,
            sourceUvs[2 * v.xref + 1]! * sourceSizePx * scale,
          ],
          turns,
        );
        sourceMinX = Math.min(sourceMinX, turned[0]);
        sourceMinY = Math.min(sourceMinY, turned[1]);

        const residualX = v.uvPx[0] - turned[0];
        const residualY = v.uvPx[1] - turned[1];
        minX = Math.min(minX, residualX);
        maxX = Math.max(maxX, residualX);
        minY = Math.min(minY, residualY);
        maxY = Math.max(maxY, residualY);
      }

      // True turn's residual is constant across the chart's vertices (rotateChartsToAxis: false),
      // so its spread is ~0 — a wrong turn scrambles the residual per vertex instead.
      const spread = maxX - minX + (maxY - minY);
      if (spread < bestSpread) {
        bestSpread = spread;
        bestTurns = turns;
        bestSourceMin = [sourceMinX, sourceMinY];
      }
    }

    // Integer offset: a texel centre survives a 90° turn only when the translation lands it back
    // on a texel centre. xatlas's `padding: 2` absorbs the ≤0.5 px rounding this introduces.
    return {
      turns: bestTurns,
      scale,
      offsetPx: [
        Math.round(dMin[0] - bestSourceMin[0]),
        Math.round(dMin[1] - bestSourceMin[1]),
      ] as Vec2,
    };
  });
}
