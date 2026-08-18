import type { GridBox } from '../../@types/GridBox';
import type { GridElement } from '../../@types/GridElement';

const BYTES_PER_ELEMENT: Readonly<Record<GridElement, number>> = { f16: 2, f32: 4 };
const UNIFORM_BYTES = 64; // McpmUniforms: 16 x 4-byte scalars, no padding (io.wesl)
const HISTOGRAM_BINS = 17; // constants.wesl N_HISTOGRAM_BINS: 16 counts + running max

/**
 * GridBuffers — every GPU allocation the sim owns. The three grids are
 * `array<GridElem>`, so f16 halves their bytes; the agent lanes stay f32
 * whatever the grid element is. `histogram` is allocated here and first used
 * by the trace-histogram pass.
 */
export type GridBuffers = {
  readonly depositA: GPUBuffer;
  readonly depositB: GPUBuffer;
  readonly trace: GPUBuffer;
  readonly agentX: GPUBuffer;
  readonly agentY: GPUBuffer;
  readonly agentZ: GPUBuffer;
  readonly agentPhi: GPUBuffer;
  readonly agentTheta: GPUBuffer;
  readonly agentWeight: GPUBuffer;
  readonly histogram: GPUBuffer;
  readonly uniform: GPUBuffer;
  destroy(): void;
};

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
      size: HISTOGRAM_BINS * 4,
      usage: storageUsage,
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
