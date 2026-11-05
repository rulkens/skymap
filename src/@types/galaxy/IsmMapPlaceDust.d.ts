import type { PlaceDustDispatchInput } from './PlaceDustDispatchInput';

export type IsmMapPlaceDust = {
  /** Encode into the CALLER's encoder/pass — no submit here (one-encoder-one-submit discipline). */
  dispatchPlaceDust(enc: GPUCommandEncoder, input: PlaceDustDispatchInput): void;
  /**
   * Debug-only: dispatch in its own encoder/submit and map the dust slot
   * range straight back — the probe's determinism/survival-floor exception,
   * no production caller. `mass` is `massBuffer`'s own `[0, count)` slice,
   * read back alongside `records` so the probe can independently recompute
   * `sumR2` off the SAME dispatch rather than a second, potentially
   * different one.
   */
  dispatchAndReadbackDust(
    input: PlaceDustDispatchInput,
  ): Promise<{ readonly records: Float32Array; readonly mass: Float32Array }>;
  /**
   * `massOut` (placeDust.wesl binding 6) — the survivor-sum input,
   * MAX_PARTICLE_COUNT floats, one per particle slot, zeroed on a
   * survival-floor miss (mirrors `comps`' amplitude-as-liveness). Exposed so
   * `ringReduce.wesl`'s csSurvivorSum kernel (dispatched separately, off
   * `createGalaxyFieldRenderer.ts`'s own `ringReduce` instance) can bind the SAME
   * buffer this dispatch just filled — producer-owns-the-buffer, same
   * ownership shape `ismMapGenerator.ringMeansBuffer` already establishes
   * for `placeDust.wesl`'s own CONSUMED input.
   */
  readonly massBuffer: GPUBuffer;
  dispose(): void;
};
