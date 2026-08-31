import type { GridBox } from '../../@types/GridBox';
import type { GridBudget } from '../../@types/GridBudget';
import type { GridElement } from '../../@types/GridElement';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { BYTES_PER_ELEMENT } from './createGridBuffers';

// agentX/Y/Z/Phi/Theta/Weight (io.wesl slots 3..8) plus T20's `densities` lane
// (histogram.wesl) — createGridBuffers.ts sizes all seven the same way (agentBufferLength
// entries), so the HUD's totalBytes must count all seven or it silently under-reports.
const AGENT_LANES = 7;
const BYTES_PER_AGENT_LANE_ENTRY = 4; // f32; only the grids carry GridElem
const DIM_GRANULARITY = 8; // decay dispatches dims/8 with no bounds tail

// Named in allocation order so a refusal points at the first buffer that fails.
const BUFFER_NAMES = ['depositA', 'depositB', 'trace', 'agents'] as const;

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

/**
 * estimateGridBudgetBytes — the total-bytes half of `planGridBudget`'s
 * arithmetic (three storage grids + seven agent lanes), pulled out as its
 * own pure function so a live UI estimate (GridBoxPanel's dims/memory
 * readout) can reuse the EXACT formula instead of growing a second,
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

/**
 * planGridBudget — the pre-allocation verdict on a grid + agent configuration.
 *
 * `agentCount` is the SoA lane LENGTH to budget: the harness passes
 * `points.count + agentCount`, since indices [0, nDataPoints) are the catalog
 * points sharing the same seven buffers. A storage buffer must clear both
 * `maxBufferSize` (to be created) and `maxStorageBufferBindingSize` (to be
 * bound), so the tighter of the two is the limit reported.
 */
export function planGridBudget(
  box: GridBox,
  agentCount: number,
  element: GridElement,
  limits: Pick<GPUSupportedLimits, 'maxBufferSize' | 'maxStorageBufferBindingSize'>,
): GridBudget {
  const limitBytes = Math.min(limits.maxBufferSize, limits.maxStorageBufferBindingSize);

  const gridBytes = bufferBytesForDims(box.dims, BYTES_PER_ELEMENT[element]);
  const laneBytes = agentCount * BYTES_PER_AGENT_LANE_ENTRY;

  const perBufferBytes = {
    depositA: gridBytes,
    depositB: gridBytes,
    trace: gridBytes,
    agents: laneBytes,
  };
  const totalBytes = estimateGridBudgetBytes(box.dims, agentCount, element);

  const offender = BUFFER_NAMES.find((name) => perBufferBytes[name] > limitBytes);
  if (offender === undefined) return { perBufferBytes, totalBytes, refusal: null };

  // At a fixed aspect ratio the voxel count scales with the cube of the long
  // axis, so the fitting axis follows from the ratio of limit to grid bytes.
  const longAxis = Math.max(box.dims[0], box.dims[1], box.dims[2]);
  const fittingAxis = longAxis * Math.cbrt(limitBytes / gridBytes);
  const maxLongAxis = Math.floor(fittingAxis / DIM_GRANULARITY) * DIM_GRANULARITY;

  return {
    perBufferBytes,
    totalBytes,
    refusal: {
      buffer: offender,
      requestedBytes: perBufferBytes[offender],
      limitBytes,
      maxLongAxis,
    },
  };
}
