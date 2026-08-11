/**
 * packIsmMapCdfParams — the uniform every `ismMapDustCdfScan.wesl` pipeline
 * reads. THAT FILE'S `IsmMapCdfParams` IS THE OFFSET AUTHORITY (same
 * discipline `packIsmMapFluidConstants.ts` documents for its own struct).
 * `rings`/`az`/`armCount` travel as f32 VALUES, not bit-pattern u32s — the
 * shader casts with `u32(...)` where it needs an index, matching
 * `ismMapFluidStep.wesl`'s own `stepIdx.step` convention — so a plain
 * `Float32Array` packs the whole struct with no `DataView` needed.
 */

/** Float count of `ismMapDustCdfScan.wesl`'s `IsmMapCdfParams` — 4 (channelWeights) + 6 scalars, rounded up to a whole 16-byte row (2 floats of slack). */
export const ISM_MAP_CDF_PARAMS_FLOATS = 12;

/** Byte size of the params struct, for `createBuffer`. */
export const ISM_MAP_CDF_PARAMS_BUFFER_SIZE = ISM_MAP_CDF_PARAMS_FLOATS * 4;

export type IsmMapCdfChannelWeights = {
  readonly gas: number;
  readonly stars: number;
  readonly activity: number;
  readonly dust: number;
};

export type IsmMapCdfParamsInput = {
  readonly rMin: number;
  readonly rMax: number;
  readonly rings: number;
  readonly az: number;
  readonly channelWeights: IsmMapCdfChannelWeights;
  /** <=0 (the default) skips the arm-envelope sum entirely — see evalWeight's own doc. */
  readonly armBias?: number;
  readonly armCount?: number;
};

export function packIsmMapCdfParams(input: IsmMapCdfParamsInput): Float32Array {
  const out = new Float32Array(ISM_MAP_CDF_PARAMS_FLOATS);

  out[0] = input.channelWeights.gas;
  out[1] = input.channelWeights.stars;
  out[2] = input.channelWeights.activity;
  out[3] = input.channelWeights.dust;
  out[4] = input.rMin;
  out[5] = input.rMax;
  out[6] = input.rings;
  out[7] = input.az;
  out[8] = input.armBias ?? 0;
  out[9] = input.armCount ?? 0;

  // Slack past the struct, written rather than left to the allocator.
  out[10] = 0;
  out[11] = 0;

  return out;
}
