import type { AgentWeights } from '../../@types/catalog/AgentWeights';
import type { CatalogPoints } from '../../@types/catalog/CatalogPoints';
import type { GridBox } from '../../@types/grid/GridBox';
import { worldToVoxel } from '../grid/box/worldToVoxel';

/**
 * cullPointsToBox — drops catalog points whose voxel coordinate falls
 * outside [0, dims) on any axis, before seeding (task S14). Polyphorm's box
 * always covers all of its data; skymap's manual box can crop the catalog,
 * and seedAgents' 'aroundData' mode anchors free agents on catalog points —
 * an anchor beyond a face wraps (modFloor in propagate.wesl) to the OPPOSITE
 * face, mirroring external structure as a thin shell. `weights.weights` is
 * index-aligned 1:1 with `points` (deriveAgentWeights' per-point output), so
 * it is filtered by the SAME mask; `nanCount`/`medianWeight` are
 * catalog-load stats and pass through unchanged.
 */
export function cullPointsToBox(
  points: CatalogPoints,
  weights: AgentWeights,
  box: GridBox,
): { readonly points: CatalogPoints; readonly weights: AgentWeights } {
  const keep: number[] = [];
  for (let i = 0; i < points.count; i++) {
    const v = worldToVoxel(box, [
      points.positions[3 * i]!,
      points.positions[3 * i + 1]!,
      points.positions[3 * i + 2]!,
    ]);
    if (
      v[0] >= 0 &&
      v[0] < box.dims[0] &&
      v[1] >= 0 &&
      v[1] < box.dims[1] &&
      v[2] >= 0 &&
      v[2] < box.dims[2]
    ) {
      keep.push(i);
    }
  }

  const count = keep.length;
  const positions = new Float32Array(count * 3);
  const weight = new Float32Array(count);
  const culledWeights = new Float32Array(count);
  for (let j = 0; j < count; j++) {
    const i = keep[j]!;
    positions[3 * j] = points.positions[3 * i]!;
    positions[3 * j + 1] = points.positions[3 * i + 1]!;
    positions[3 * j + 2] = points.positions[3 * i + 2]!;
    weight[j] = points.weight[i]!;
    culledWeights[j] = weights.weights[i]!;
  }

  return {
    points: { positions, weight, count, sources: points.sources },
    weights: {
      weights: culledWeights,
      nanCount: weights.nanCount,
      medianWeight: weights.medianWeight,
    },
  };
}
