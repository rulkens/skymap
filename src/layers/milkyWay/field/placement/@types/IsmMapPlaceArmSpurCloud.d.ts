import type { PlaceArmSpurCloudDispatchInput } from './PlaceArmSpurCloudDispatchInput';

export type IsmMapPlaceArmSpurCloud = {
  /** Encode into the CALLER's encoder/pass — no submit here (one-encoder-one-submit discipline). */
  dispatchPlaceArmSpurCloud(enc: GPUCommandEncoder, input: PlaceArmSpurCloudDispatchInput): void;
  /**
   * Debug-only: dispatch in its own encoder/submit and map the reservation's
   * slot range straight back — the probe's determinism/budget/liveness
   * exception, no production caller. `fluxWeight` is `fluxWeightBuffer`'s own
   * `[0, count)` slice, read back alongside `records` —
   * `createIsmMapPlaceArmCloud.ts`'s own identical precedent.
   */
  dispatchAndReadbackArmSpurCloud(
    input: PlaceArmSpurCloudDispatchInput,
  ): Promise<{ readonly records: Float32Array; readonly fluxWeight: Float32Array }>;
  /** `fluxWeightOut` (placeArmSpurCloud.wesl binding 3) — SPUR_CLOUD_MAX_COUNT floats, one per particle slot. */
  readonly fluxWeightBuffer: GPUBuffer;
  dispose(): void;
};
