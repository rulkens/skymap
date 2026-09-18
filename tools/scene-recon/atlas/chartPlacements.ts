import { rotateTurns, type Turns } from './rotateTurns';
import type { ChartPlacement } from '../@types/ChartPlacement';
import type { PackedAtlas } from '../@types/PackedAtlas';
import type { PackedVertex } from '../@types/PackedVertex';
import type { Vec2 } from '../../../src/@types/math/Vec2';

const TURNS: readonly Turns[] = [0, 1, 2, 3];
const MIRRORS: readonly boolean[] = [false, true];

// xatlas places a chart by a turn, an x-mirror (for charts whose source UVs are wound negatively)
// and a translation, then rounds its width and height UP to whole texels INDEPENDENTLY — a stretch
// of strictly under one texel per axis, which the placement drops to keep the copy texel-exact and
// the chart anchored inside xatlas's footprint. So a residual spread wider than that rounding means
// the fit is none of the 8 transforms xatlas can produce (an off-axis rotation, a rescale) and the
// bake would silently copy the wrong source region. Measured over both real packs of mesh-cropped:
// the winner's per-axis spread never passes 0.99997 px, and the runner-up only comes within a texel
// for charts under 6 px across, which are symmetric at texel resolution anyway.
const XATLAS_AXIS_ROUNDING_PX = 1;
const FIT_NOISE_PX = 1 / 64; // f32 source UVs × 8192 source texels, with room to spare

/** One placement per chart index; xatlas chooses WHERE a chart goes, this recovers HOW it got
 *  there — turn, mirror, integer offset — so the bake can invert it exactly. */
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

    let bestTurns: Turns = 0;
    let bestMirrorX = false;
    let bestSpread = Infinity;
    let bestSourceMin: Vec2 = [0, 0];

    for (const mirrorX of MIRRORS) {
      for (const turns of TURNS) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let sourceMinX = Infinity;
        let sourceMinY = Infinity;

        for (const v of members) {
          const sourceX = sourceUvs[2 * v.xref]! * sourceSizePx * scale;
          const turned = rotateTurns(
            [mirrorX ? -sourceX : sourceX, sourceUvs[2 * v.xref + 1]! * sourceSizePx * scale],
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

        // Per axis, not summed: the rounding budget is one texel on each axis separately.
        const spread = Math.max(maxX - minX, maxY - minY);
        if (spread < bestSpread) {
          bestSpread = spread;
          bestTurns = turns;
          bestMirrorX = mirrorX;
          bestSourceMin = [sourceMinX, sourceMinY];
        }
      }
    }

    if (bestSpread > XATLAS_AXIS_ROUNDING_PX + FIT_NOISE_PX) {
      throw new Error(
        `chartPlacements: chart ${chartIndex} best fit (turns ${bestTurns}${bestMirrorX ? ', mirrored' : ''}) leaves a per-axis residual spread of ${bestSpread.toFixed(3)}px, wider than xatlas's ${XATLAS_AXIS_ROUNDING_PX}px texel rounding — it rotated the chart off-axis or rescaled it`,
      );
    }

    // Integer offset: a texel centre survives a turn and a mirror only when the translation lands
    // it back on a texel centre. xatlas's `padding: 2` absorbs the ≤0.5 px rounding this adds.
    return {
      turns: bestTurns,
      mirrorX: bestMirrorX,
      scale,
      offsetPx: [
        Math.round(dMin[0] - bestSourceMin[0]),
        Math.round(dMin[1] - bestSourceMin[1]),
      ] as Vec2,
    };
  });
}
