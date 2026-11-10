import type { DispatchSurvivorSumInput } from './DispatchSurvivorSumInput';
import type { DispatchFluxWeightSumInput } from './DispatchFluxWeightSumInput';

export type IsmMapRingReduce = {
  /** Encode the ring-means pass into the CALLER's encoder — no submit here, same one-encoder-one-submit contract `IsmMapOutput`'s encode*Pass methods use. */
  dispatchRingMeans(enc: GPUCommandEncoder): void;
  /**
   * Encode the survivor-sum + Larson renorm pass into the CALLER's encoder,
   * same no-submit contract. Must be encoded AFTER whatever `placeDust`
   * dispatch filled `input.massBuffer` for THIS rebuild, in the same
   * encoder/submit — cross-pass ordering within one submit is what
   * guarantees this reads fresh data with no readback of its own
   * (`createGalaxyFieldRenderer.ts`'s `place:dust` stage row is the production
   * caller). Writes `dustRenormBuffer[0]`.
   */
  dispatchSurvivorSum(enc: GPUCommandEncoder, input: DispatchSurvivorSumInput): void;
  /**
   * `dustRenorm` (dustMap/fragment.wesl binding 14) — the Larson massPerR2
   * scale `dispatchSurvivorSum` writes and the dust splat pass reads, as a
   * storage buffer bound BOTH ways (read_write here, read-only there): no
   * uniform round trip, since the CPU never learns this value.
   */
  readonly dustRenormBuffer: GPUBuffer;
  /** Debug-only: maps `dustRenormBuffer[0]` back to the CPU — the probe's own numeric-validation exception (`readback:placeDust`'s survivor-sum assertion), no production caller. */
  readDustRenormScale(): Promise<number>;
  /**
   * The arm-cloud twin of `dispatchSurvivorSum` — encodes
   * `ringReduce.wesl`'s `csArmCloudFluxWeightSum` into the CALLER's encoder,
   * same no-submit/must-run-after-the-producer-dispatch contract. Writes
   * `armCloudRenormBuffer[0]`.
   */
  dispatchArmCloudFluxWeightSum(enc: GPUCommandEncoder, input: DispatchFluxWeightSumInput): void;
  /** `armCloudRenorm` (fieldSplat/fragment.wesl binding 15) — the reciprocal weightSum scale, read_write here, read-only there. */
  readonly armCloudRenormBuffer: GPUBuffer;
  /** Debug-only: maps `armCloudRenormBuffer[0]` back to the CPU — the probe's own numeric-validation exception, no production caller. */
  readArmCloudRenormScale(): Promise<number>;
  /** The spur-cloud twin of `dispatchArmCloudFluxWeightSum` — same shape, `csArmSpurFluxWeightSum`. */
  dispatchArmSpurFluxWeightSum(enc: GPUCommandEncoder, input: DispatchFluxWeightSumInput): void;
  /** `spurCloudRenorm` (fieldSplat/fragment.wesl binding 16) — the spur-cloud twin of `armCloudRenormBuffer`. */
  readonly spurCloudRenormBuffer: GPUBuffer;
  /** Debug-only twin of `readArmCloudRenormScale`. */
  readArmSpurRenormScale(): Promise<number>;
  dispose(): void;
};
