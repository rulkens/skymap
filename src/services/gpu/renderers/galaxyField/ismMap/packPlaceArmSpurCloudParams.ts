/**
 * packPlaceArmSpurCloudParams — the uniform placeArmSpurCloud.wesl reads.
 * THAT FILE'S `PlaceArmSpurCloudParams` IS THE OFFSET AUTHORITY (same
 * discipline packPlaceDustParams.ts documents for its own struct).
 *
 * u32 fields travel as REAL u32s (packPlaceDustParams.ts's own precedent):
 * `seed` can exceed f32's 24-bit exact-integer range, so this packer
 * aliases one ArrayBuffer with both a Uint32Array and a Float32Array view.
 */

/** Float count of placeArmSpurCloud.wesl's `PlaceArmSpurCloudParams` — 6 vec4 rows. */
export const PLACE_ARM_SPUR_CLOUD_PARAMS_FLOATS = 24;

/** Byte size of the params struct, for `createBuffer`. */
export const PLACE_ARM_SPUR_CLOUD_PARAMS_BUFFER_SIZE = PLACE_ARM_SPUR_CLOUD_PARAMS_FLOATS * 4;

export type PlaceArmSpurCloudParamsInput = {
  readonly seed: number;
  readonly count: number;
  readonly spurCount: number;
  readonly reservationOffset: number;
  readonly spurFlux: number;
  /** Sum of every spur's `spurFootprintIntegral` pick weight — `pickWeighted`'s own normaliser. */
  readonly weightSum: number;
  readonly elongation: number;
  readonly sizeScale: number;
  readonly widthScale: number;
  readonly excessScaleRatio: number;
  readonly hLight: number;
  readonly diskHeight: number;
  readonly armStartRadius: number;
  readonly armInnerRampW: number;
  readonly armFullRadius: number;
  readonly waveAmount: number;
  readonly diskScaleLen: number;
  readonly warpStrength: number;
  readonly warpTwist: number;
  readonly warpStartRadius: number;
  readonly outerRadius: number;
};

export function packPlaceArmSpurCloudParams(input: PlaceArmSpurCloudParamsInput): ArrayBuffer {
  const buf = new ArrayBuffer(PLACE_ARM_SPUR_CLOUD_PARAMS_BUFFER_SIZE);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);

  // `>>> 0`: reinterpret the signed int32 seed as the u32 bit pattern the
  // shader's genRand hashes — packPlaceDustParams.ts's own site.
  u32[0] = input.seed >>> 0;
  u32[1] = input.count;
  u32[2] = input.spurCount;
  u32[3] = input.reservationOffset;

  f32[4] = input.spurFlux;
  f32[5] = input.weightSum;
  f32[6] = input.elongation;
  f32[7] = input.sizeScale;

  f32[8] = input.widthScale;
  f32[9] = input.excessScaleRatio;
  f32[10] = input.hLight;
  f32[11] = input.diskHeight;

  f32[12] = input.armStartRadius;
  f32[13] = input.armInnerRampW;
  f32[14] = input.armFullRadius;
  f32[15] = input.waveAmount;

  f32[16] = input.diskScaleLen;
  f32[17] = input.warpStrength;
  f32[18] = input.warpTwist;
  f32[19] = input.warpStartRadius;

  f32[20] = input.outerRadius;
  f32[21] = 0; // _pad0
  f32[22] = 0; // _pad1
  f32[23] = 0; // _pad2

  return buf;
}
