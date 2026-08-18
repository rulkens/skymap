import type { GridBox } from '../../@types/GridBox';
import type { GridElement } from '../../@types/GridElement';

// Single-sourced here: planGridBudget's preflight and encodeStep's uniform write
// must agree with these byte-for-byte or the preflight greenlights an allocation
// that overflows, or the write silently disagrees with the buffer it targets.
export const BYTES_PER_ELEMENT: Readonly<Record<GridElement, number>> = { f16: 2, f32: 4 };
export const UNIFORM_BYTES = 64; // McpmUniforms: 16 x 4-byte scalars, no padding (io.wesl)
export const HISTOGRAM_FLAGS_BYTES = 4; // HistogramFlags: one i32 (histogram.wesl)
export const HISTOGRAM_BINS = 17; // constants.wesl N_HISTOGRAM_BINS: 16 counts + running max
// The `histogram` buffer holds one MORE element than HISTOGRAM_BINS: index HISTOGRAM_BINS is
// this project's own in-grid sampled-point counter (histogram.wesl), not one of the fork's bins.
// constants.wesl's HISTOGRAM_BASE is a `const` (not `override`) — fixed at build time, never a
// per-run knob — so one host-side mirror is enough; HistogramPlot's "(log <base>)" readout
// quotes this rather than restating 10 a second time.
export const HISTOGRAM_BASE = 10;

/**
 * GridBuffers — every GPU allocation the sim owns. The three grids are
 * `array<GridElem>`, so f16 halves their bytes; the agent lanes stay f32
 * whatever the grid element is. `histogram` is allocated here and first used
 * by the trace-histogram pass; `densities` and `histogramFlags` are its
 * T20 siblings — one density sample per agent-lane slot (the kernel only
 * ever writes the first `nDataPoints` of them) and the pass's own tiny
 * uniform (just `sampleRandomly` — the pass reuses `uniform`/McpmUniforms
 * for everything else; see histogram.wesl's header for why it can't have
 * its own full-size uniform).
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
  readonly densities: GPUBuffer;
  readonly histogramFlags: GPUBuffer;
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
