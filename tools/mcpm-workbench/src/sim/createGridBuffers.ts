import type { GridBox } from '../../@types/grid/GridBox';
import type { GridElement } from '../../@types/grid/GridElement';
import { BYTES_PER_ELEMENT } from './bytesPerElement.constant';
import { UNIFORM_BYTES } from './uniformBytes.constant';
import { HISTOGRAM_FLAGS_BYTES } from './histogramFlagsBytes.constant';
import { HISTOGRAM_BINS } from './histogramBins.constant';
import type { GridBuffers } from '../../@types/sim/GridBuffers';

/**
 * createGridBuffers — allocates the sim's buffers. Call `planGridBudget`
 * first: a buffer over the device's limits throws out of `createBuffer` here,
 * which is exactly the failure the preflight exists to turn into a message.
 */
export function createGridBuffers(
  device: GPUDevice,
  box: GridBox,
  agentBufferLength: number,
  element: GridElement,
): GridBuffers {
  const gridBytes = box.dims[0] * box.dims[1] * box.dims[2] * BYTES_PER_ELEMENT[element];
  // COPY_DST for clearBuffer (reset/clearTrace), COPY_SRC for readback + export.
  const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;

  const grid = (label: string): GPUBuffer =>
    device.createBuffer({ label, size: gridBytes, usage: storageUsage });
  const lane = (label: string): GPUBuffer =>
    device.createBuffer({ label, size: agentBufferLength * 4, usage: storageUsage });

  const buffers = {
    depositA: grid('mcpm-deposit-a'),
    depositB: grid('mcpm-deposit-b'),
    trace: grid('mcpm-trace'),
    agentX: lane('mcpm-agent-x'),
    agentY: lane('mcpm-agent-y'),
    agentZ: lane('mcpm-agent-z'),
    agentPhi: lane('mcpm-agent-phi'),
    agentTheta: lane('mcpm-agent-theta'),
    agentWeight: lane('mcpm-agent-weight'),
    histogram: device.createBuffer({
      label: 'mcpm-histogram',
      size: (HISTOGRAM_BINS + 1) * 4,
      usage: storageUsage,
    }),
    densities: lane('mcpm-densities'),
    histogramFlags: device.createBuffer({
      label: 'mcpm-histogram-flags',
      size: HISTOGRAM_FLAGS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    uniform: device.createBuffer({
      label: 'mcpm-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  };

  return {
    ...buffers,
    destroy(): void {
      for (const buffer of Object.values(buffers)) buffer.destroy();
    },
  };
}
