/**
 * packPlaceArmCloudParams — the uniform placeArmCloud.wesl reads. THAT
 * FILE'S `PlaceArmCloudParams` IS THE OFFSET AUTHORITY (same discipline
 * packPlaceArmSpurCloudParams.ts documents for its own struct).
 *
 * u32 fields travel as REAL u32s (packPlaceDustParams.ts's own precedent):
 * `seed` can exceed f32's 24-bit exact-integer range, so this packer
 * aliases one ArrayBuffer with both a Uint32Array and a Float32Array view.
 */

/** Float count of placeArmCloud.wesl's `PlaceArmCloudParams` — 8 vec4 rows. */
export const PLACE_ARM_CLOUD_PARAMS_FLOATS = 32;

/** Byte size of the params struct, for `createBuffer`. */
export const PLACE_ARM_CLOUD_PARAMS_BUFFER_SIZE = PLACE_ARM_CLOUD_PARAMS_FLOATS * 4;

export type PlaceArmCloudParamsInput = {
  readonly seed: number;
  readonly count: number;
  readonly armCount: number;
  readonly reservationOffset: number;

  readonly childrenPerComplex: number;
  /** Sum of every arm's `armAgeWeight` pick weight — `pickWeighted`'s own normaliser. */
  readonly armWeightSum: number;
  readonly elongation: number;
  readonly sizeScale: number;

  readonly complexSpread: number;
  readonly sigmaZComplex: number;
  readonly widthScale: number;
  readonly excessScaleRatio: number;

  readonly hLight: number;
  /** `tiltReferenceRadius(geometry)` — the outermost arm's own fade radius. */
  readonly tiltRefRadius: number;
  /** `Math.max(0, tuning.arms.cloud.radialBias)` — already clamped by the caller. */
  readonly radialBias: number;
  readonly youngFraction: number;

  /** Component k's radial sigma (`DISC_SIGMA_RATIOS[k] * hLight`), the smooth-disc fallback's own draw. */
  readonly discSigmaR: readonly [number, number, number, number];

  readonly discWeightSum: number;
  readonly warpStrength: number;
  readonly warpTwist: number;
  readonly warpStartRadius: number;

  readonly outerRadius: number;
  readonly armStartRadius: number;
  readonly armInnerRampW: number;
  readonly armFullRadius: number;

  readonly waveAmount: number;
  readonly diskScaleLen: number;
  /** `armExcessFlux * cloudShare` — galaxyFieldMixture.ts's own cloudFlux. */
  readonly cloudFlux: number;
};

export function packPlaceArmCloudParams(input: PlaceArmCloudParamsInput): ArrayBuffer {
  const buf = new ArrayBuffer(PLACE_ARM_CLOUD_PARAMS_BUFFER_SIZE);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);

  // `>>> 0`: reinterpret the signed int32 seed as the u32 bit pattern the
  // shader's genRand hashes — packPlaceDustParams.ts's own site.
  u32[0] = input.seed >>> 0;
  u32[1] = input.count;
  u32[2] = input.armCount;
  u32[3] = input.reservationOffset;

  u32[4] = input.childrenPerComplex;
  f32[5] = input.armWeightSum;
  f32[6] = input.elongation;
  f32[7] = input.sizeScale;

  f32[8] = input.complexSpread;
  f32[9] = input.sigmaZComplex;
  f32[10] = input.widthScale;
  f32[11] = input.excessScaleRatio;

  f32[12] = input.hLight;
  f32[13] = input.tiltRefRadius;
  f32[14] = input.radialBias;
  f32[15] = input.youngFraction;

  f32[16] = input.discSigmaR[0];
  f32[17] = input.discSigmaR[1];
  f32[18] = input.discSigmaR[2];
  f32[19] = input.discSigmaR[3];

  f32[20] = input.discWeightSum;
  f32[21] = input.warpStrength;
  f32[22] = input.warpTwist;
  f32[23] = input.warpStartRadius;

  f32[24] = input.outerRadius;
  f32[25] = input.armStartRadius;
  f32[26] = input.armInnerRampW;
  f32[27] = input.armFullRadius;

  f32[28] = input.waveAmount;
  f32[29] = input.diskScaleLen;
  f32[30] = input.cloudFlux;
  f32[31] = 0; // _pad0

  return buf;
}
