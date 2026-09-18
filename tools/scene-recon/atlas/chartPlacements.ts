import { rotateTurns, type Turns } from './rotateTurns';
import type { ChartPlacement } from '../@types/ChartPlacement';
import type { PackedAtlas } from '../@types/PackedAtlas';
import type { PackedVertex } from '../@types/PackedVertex';
import type { Vec2 } from '../../../src/@types/math/Vec2';

const TURNS: readonly Turns[] = [0, 1, 2, 3];

// A genuine 90°-turn fit's residual spread is float32 noise; xatlas can also rotate a chart by a
// non-90° angle or shrink one past the resolution, which lands the fit off by more than this and
// must throw rather than silently copy from the wrong source region (spec §5.6).
const MAX_FIT_RESIDUAL_SPREAD_PX = 0.05;

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

  return membersByChart.map((members, chartIndex) => {
    if (members.length === 0) {
      throw new Error(`chartPlacements: chart ${chartIndex} has no member vertices`);
    }

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
        const turned = rotateTurns(
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

    if (bestSpread > MAX_FIT_RESIDUAL_SPREAD_PX) {
      throw new Error(
        `chartPlacements: chart ${chartIndex} best-turn residual spread ${bestSpread.toFixed(3)}px exceeds ${MAX_FIT_RESIDUAL_SPREAD_PX}px — xatlas likely rotated it off-axis or shrank it past the atlas resolution`,
      );
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
