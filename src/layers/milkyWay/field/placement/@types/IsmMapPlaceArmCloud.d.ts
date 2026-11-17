import type { PlaceArmCloudDispatchInput } from './PlaceArmCloudDispatchInput';

export type IsmMapPlaceArmCloud = {
  /** Encode into the CALLER's encoder/pass — no submit here (one-encoder-one-submit discipline). */
  dispatchPlaceArmCloud(enc: GPUCommandEncoder, input: PlaceArmCloudDispatchInput): void;
  /**
   * Debug-only: dispatch in its own encoder/submit and map the reservation's
   * slot range straight back — the probe's determinism/budget/liveness
   * exception, no production caller. `fluxWeight` is `fluxWeightBuffer`'s own
   * `[0, count)` slice, read back alongside `records` so the probe can
   * independently recompute `weightSum` off the SAME dispatch rather than a
   * second, potentially different one.
   */
  dispatchAndReadbackArmCloud(
    input: PlaceArmCloudDispatchInput,
  ): Promise<{ readonly records: Float32Array; readonly fluxWeight: Float32Array }>;
  /**
   * `fluxWeightOut` (placeArmCloud.wesl binding 5) — ARM_CLOUD_MAX_COUNT
   * floats, one per particle slot. Exposed so `ringReduce.wesl`'s
   * csArmCloudFluxWeightSum kernel (dispatched separately, off
   * `createGalaxyFieldRenderer.ts`'s own `ringReduce` instance) can bind the SAME
   * buffer this dispatch just filled — `IsmMapPlaceDust.massBuffer`'s own
   * producer-owns-the-buffer precedent.
   */
  readonly fluxWeightBuffer: GPUBuffer;
  dispose(): void;
};
