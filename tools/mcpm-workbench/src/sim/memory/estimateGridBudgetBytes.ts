import type { GridElement } from '../../../@types/grid/GridElement';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { BYTES_PER_ELEMENT } from '../bytesPerElement.constant';
import { BYTES_PER_AGENT_LANE_ENTRY } from './bytesPerAgentLaneEntry.constant';
import { bufferBytesForDims } from './bufferBytesForDims';

// agentX/Y/Z/Phi/Theta/Weight (io.wesl slots 3..8) plus T20's `densities` lane
// (histogram.wesl) — createGridBuffers.ts sizes all seven the same way (agentBufferLength
// entries), so the HUD's totalBytes must count all seven or it silently under-reports.
const AGENT_LANES = 7;

/**
 * estimateGridBudgetBytes — the total-bytes half of `planGridBudget`'s
 * arithmetic (three storage grids + seven agent lanes), pulled out as its
 * own pure function so a live UI estimate (Stats' memory readout, via
 * estimateBoxGpuBytes) can reuse the EXACT formula instead of growing a second,
 * driftable copy of it. No device limits here on purpose — this is a size
 * estimate, not a refusal check; `planGridBudget` is still the one place
 * that decides whether an allocation actually fits.
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
