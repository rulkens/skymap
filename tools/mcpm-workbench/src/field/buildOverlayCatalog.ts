import type { AgentWeights } from '../../@types/AgentWeights';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import type { GridBox } from '../../@types/GridBox';
import { renormalizeWeightMass } from './renormalizeWeightMass';
import { worldToVoxel } from './worldToVoxel';

/** Voxel-space lanes for the Galaxies overlay's own draw set — same shape as seedAgents'
 * catalog-prefix lanes, but over every point that survived source/tier load (task S16):
 * the overlay is a data preview, not the sim's box-culled readout. */
export type OverlayCatalog = {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly weight: Float32Array;
};

/**
 * buildOverlayCatalog — voxel positions + mean-1 weights for the Galaxies overlay, over
 * the RAW (pre-cull) `points`. Unlike createMcpmHarness's `cullPointsToBox`, nothing here
 * drops a point outside the box: `worldToVoxel` maps it to a coordinate outside [0, dims),
 * which galaxyPoints.wesl projects like any other (no box test in that shader). `weights`
 * is renormalized over this same RAW population, matching galaxyOverlayPass's
 * `weightScale` numerator (the raw drawn count) rather than the sim's culled one.
 */
export function buildOverlayCatalog(
  points: CatalogPoints,
  weights: AgentWeights,
  box: GridBox,
): OverlayCatalog {
  const n = points.count;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = worldToVoxel(box, [
      points.positions[3 * i]!,
      points.positions[3 * i + 1]!,
      points.positions[3 * i + 2]!,
    ]);
    x[i] = v[0];
    y[i] = v[1];
    z[i] = v[2];
  }
  return { x, y, z, weight: renormalizeWeightMass(weights.weights) };
}
