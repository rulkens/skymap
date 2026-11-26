import type { GridBox } from '../../../@types/grid/GridBox';
import type { GridBudget } from '../../../@types/sim/memory/GridBudget';
import type { GridElement } from '../../../@types/grid/GridElement';
import { bufferLimitBytes } from './bufferLimitBytes';
import { BYTES_PER_ELEMENT } from '../bytesPerElement.constant';
import { BYTES_PER_AGENT_LANE_ENTRY } from './bytesPerAgentLaneEntry.constant';
import { bufferBytesForDims } from './bufferBytesForDims';
import { DECAY_WG_EDGE } from '../decayWgEdge.constant';

// Named in allocation order so a refusal points at the first buffer that fails.
const BUFFER_NAMES = ['depositA', 'depositB', 'trace', 'agents'] as const;

/**
 * planGridBudget — the pre-allocation verdict on a grid + agent configuration.
 *
 * `agentCount` is the SoA lane LENGTH to budget: the harness passes
 * `points.count + agentCount`, since indices [0, nDataPoints) are the catalog
 * points sharing the same seven buffers. Each buffer is checked against
 * `bufferLimitBytes`.
 */
export function planGridBudget(
  box: GridBox,
  agentCount: number,
  element: GridElement,
  limits: Pick<GPUSupportedLimits, 'maxBufferSize' | 'maxStorageBufferBindingSize'>,
): GridBudget {
  const limitBytes = bufferLimitBytes(limits);

  const gridBytes = bufferBytesForDims(box.dims, BYTES_PER_ELEMENT[element]);
  const laneBytes = agentCount * BYTES_PER_AGENT_LANE_ENTRY;

  const perBufferBytes = {
    depositA: gridBytes,
    depositB: gridBytes,
    trace: gridBytes,
    agents: laneBytes,
  };

  const offender = BUFFER_NAMES.find((name) => perBufferBytes[name] > limitBytes);
  if (offender === undefined) return { perBufferBytes, refusal: null };

  // At a fixed aspect ratio the voxel count scales with the cube of the long
  // axis, so the fitting axis follows from the ratio of limit to grid bytes.
  const longAxis = Math.max(box.dims[0], box.dims[1], box.dims[2]);
  const fittingAxis = longAxis * Math.cbrt(limitBytes / gridBytes);
  const maxLongAxis = Math.floor(fittingAxis / DECAY_WG_EDGE) * DECAY_WG_EDGE;

  return {
    perBufferBytes,
    refusal: {
      buffer: offender,
      requestedBytes: perBufferBytes[offender],
      limitBytes,
      maxLongAxis,
    },
  };
}
