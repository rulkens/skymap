import type { Vec3 } from '../../../../shared/src/@types/math/Vec3';

/**
 * bufferBytesForDims — one grid buffer's byte count for a dims/element-size
 * pair: the per-buffer term `estimateGridBudgetBytes` and `planGridBudget`'s
 * refusal check both need, and the one `minFeasibleVoxelSizeMpc` shares too
 * (it takes `elementBytes` raw, not `GridElement`, since it never resolves
 * f16 vs f32 itself — that stays deriveGridBox's job).
 */
export function bufferBytesForDims(dims: Vec3, elementBytes: number): number {
  return dims[0] * dims[1] * dims[2] * elementBytes;
}
