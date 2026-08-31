import type { AgentWeights } from '../../@types/AgentWeights';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import type { GridBox } from '../../@types/GridBox';
import { worldToVoxel } from './worldToVoxel';

/**
 * cullPointsToBox — drops catalog points whose voxel coordinate falls
 * outside [0, dims) on any axis, before seeding (task S14). Polyphorm's box
 * always covers all of its data; skymap's manual box can crop the catalog,
 * and seedAgents' 'aroundData' mode anchors free agents on catalog points —
 * an anchor beyond a face wraps (modFloor in propagate.wesl) to the OPPOSITE
 * face, mirroring external structure as a thin shell. `weights.weights` is
 * index-aligned 1:1 with `points` (deriveAgentWeights' per-point output), so
 * it is filtered by the SAME mask; `nanCount`/`medianLog10Mass` are
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
  const log10StellarMass = new Float32Array(count);
  const culledWeights = new Float32Array(count);
  for (let j = 0; j < count; j++) {
    const i = keep[j]!;
    positions[3 * j] = points.positions[3 * i]!;
    positions[3 * j + 1] = points.positions[3 * i + 1]!;
    positions[3 * j + 2] = points.positions[3 * i + 2]!;
    log10StellarMass[j] = points.log10StellarMass[i]!;
    culledWeights[j] = weights.weights[i]!;
  }

  return {
    points: { positions, log10StellarMass, count, sources: points.sources },
    weights: {
      weights: culledWeights,
      nanCount: weights.nanCount,
      medianLog10Mass: weights.medianLog10Mass,
    },
  };
}
