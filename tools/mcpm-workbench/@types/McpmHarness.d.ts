import type { AgentBuffers } from './AgentBuffers';
import type { GridBox } from './GridBox';
import type { GridElement } from './GridElement';
import type { AgentInitMode } from './AgentInitMode';
import type { HistogramReadback } from './HistogramReadback';
import type { McpmParams } from './McpmParams';
import type { TraceReadback } from './TraceReadback';
import type { GpuContext } from '../../../src/@types/rendering/GpuContext';

/**
 * McpmHarness — the stepping MCPM simulation: GPU buffers, pipelines and the
 * propagate → decay encode. `element` is decided by the device's shader-f16
 * support alone, so the flag and the device can never disagree.
 */
export type McpmHarness = {
  readonly element: GridElement;
  readonly box: GridBox;
  /**
   * The GpuContext the caller acquired via `initGpu` and handed in (task R5 —
   * the harness never calls `initGpu` itself). T10's render passes and T11's
   * viewport must consume this rather than calling `initGpu` again on the same
   * canvas — a second call reconfigures the swap chain and would hand the
   * render passes a device without the compute limits the kernels need (see
   * task-T9-review.md concern 4).
   */
  readonly gpu: GpuContext;
  /**
   * The trace grid the render passes march. Stays the harness's to destroy —
   * a consumer that outlives a rebuild must re-read it from the new harness.
   */
  readonly traceBuffer: GPUBuffer;
  /**
   * The lanes the agent-splat and sim itself read from — box-culled, same set the deposit
   * seeds from. Same ownership rule as `traceBuffer`; read-only, only the sim's own
   * kernels ever write them.
   */
  readonly agents: AgentBuffers;
  /**
   * The Galaxies overlay's OWN lanes (task S16) — every point that survived source/tier
   * load, in-box or not, weighted mean-1 over that same RAW population. A preview layer,
   * not the sim's readout: `nDataPoints === count` here, no free-agent suffix, and no
   * compute kernel ever writes them. Same ownership rule as `traceBuffer`.
   */
  readonly overlayAgents: AgentBuffers;
  /**
   * Queues one propagate + decay + histogram triple and advances the step
   * counter. The histogram dispatch runs every step (cheap: only
   * `nDataPoints` invocations do real work) so its GPU-side counts/densities
   * are always fresh; `sampleRandomly` toggles its jittered-position mode.
   * Throttling which steps bother to call `readHistogram` is the caller's job.
   */
  step(params: McpmParams, sampleRandomly: boolean): void;
  /** Zeroes the trace grid only; agents and deposit survive. */
  clearTrace(): void;
  /** Re-seeds agents and zeroes every grid; resets the step counter. */
  reset(mode: AgentInitMode, seed: number): void;
  dispose(): void;
  /** Copies the trace grid to the CPU; rejects before allocating if the MAP_READ staging copy would exceed the device's `maxBufferSize`. */
  readbackTrace(): Promise<TraceReadback>;
  /** Copies back the last `step()`'s histogram counts + per-point densities. */
  readHistogram(): Promise<HistogramReadback>;
};
