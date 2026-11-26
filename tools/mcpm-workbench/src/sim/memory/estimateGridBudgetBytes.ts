import type { GridElement } from '../../../@types/grid/GridElement';
import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';
import { BYTES_PER_ELEMENT } from '../bytesPerElement.constant';
import { BYTES_PER_AGENT_LANE_ENTRY } from './bytesPerAgentLaneEntry.constant';
import { bufferBytesForDims } from './bufferBytesForDims';

// agentX/Y/Z/Phi/Theta/Weight (io.wesl slots 3..8) plus the histogram's `densities`
// lane — createGridBuffers.ts sizes all seven the same way (agentBufferLength entries),
// so the estimate must count all seven or it silently under-reports.
const AGENT_LANES = 7;

/**
 * estimateGridBudgetBytes — the sim's total GPU bytes: three storage grids plus
 * seven agent lanes. A size estimate, not a refusal check: `planGridBudget` is
 * the one place that decides whether an allocation fits.
 */
export function estimateGridBudgetBytes(
  dims: Vec3,
  agentCount: number,
  element: GridElement,
): number {
  const gridBytes = bufferBytesForDims(dims, BYTES_PER_ELEMENT[element]);
  const laneBytes = agentCount * BYTES_PER_AGENT_LANE_ENTRY;
  return 3 * gridBytes + AGENT_LANES * laneBytes;
}
