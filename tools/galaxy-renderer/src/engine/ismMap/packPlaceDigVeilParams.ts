/**
 * packPlaceDigVeilParams — the uniform `placeDigVeil.wesl` reads. THAT
 * FILE'S `PlaceDigVeilParams` IS THE OFFSET AUTHORITY (same discipline
 * `packPlaceDustParams.ts` documents for its own struct).
 *
 * u32 fields travel as REAL u32s (`packPlaceDustParams.ts`'s own
 * precedent): `seed` can exceed f32's 24-bit exact-integer range, so this
 * packer aliases one ArrayBuffer with both a Uint32Array and a Float32Array
 * view rather than casting everything through f32.
 */

/** Float count of `placeDigVeil.wesl`'s `PlaceDigVeilParams` — 7 vec4 rows. */
export const PLACE_DIG_VEIL_PARAMS_FLOATS = 28;

/** Byte size of the params struct, for `createBuffer`. */
export const PLACE_DIG_VEIL_PARAMS_BUFFER_SIZE = PLACE_DIG_VEIL_PARAMS_FLOATS * 4;

export type PlaceDigVeilParamsInput = {
  readonly seed: number;
  readonly count: number;
  readonly childrenPerComplex: number;
  readonly reservationOffset: number;
  readonly generatorIsFluid: boolean;
  readonly cdfRings: number;
  readonly cdfAz: number;
  readonly cdfRMin: number;
  readonly cdfRMax: number;
  readonly complexSpread: number;
  readonly elongation: number;
  readonly coherence: number;
  readonly amplitudeBase: number;
  readonly scaleHeight: number;
  readonly sigmaMin: number;
  readonly sigmaMax: number;
  readonly textureWeight: number;
  readonly warpStrength: number;
  readonly warpTwist: number;
  readonly warpStartRadius: number;
  readonly outerRadius: number;
  readonly color: readonly [number, number, number];
};

export function packPlaceDigVeilParams(input: PlaceDigVeilParamsInput): ArrayBuffer {
  const buf = new ArrayBuffer(PLACE_DIG_VEIL_PARAMS_BUFFER_SIZE);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);

  // `>>> 0`: reinterpret the signed int32 seed as the u32 bit pattern the
  // shader's genRand hashes — same site normalizeGenerationSeed.ts's own
  // header points to.
  u32[0] = input.seed >>> 0;
  u32[1] = input.count;
  u32[2] = input.childrenPerComplex;
  u32[3] = input.reservationOffset;

  u32[4] = input.generatorIsFluid ? 1 : 0;
  u32[5] = input.cdfRings;
  u32[6] = input.cdfAz;
  u32[7] = 0; // _padU0

  f32[8] = input.cdfRMin;
  f32[9] = input.cdfRMax;
  f32[10] = input.complexSpread;
  f32[11] = input.elongation;

  f32[12] = input.coherence;
  f32[13] = input.amplitudeBase;
  f32[14] = input.scaleHeight;
  f32[15] = input.sigmaMin;

  f32[16] = input.sigmaMax;
  f32[17] = input.textureWeight;
  f32[18] = input.warpStrength;
  f32[19] = input.warpTwist;

  f32[20] = input.warpStartRadius;
  f32[21] = input.outerRadius;
  f32[22] = 0; // _pad1
  f32[23] = 0; // _pad2

  f32[24] = input.color[0];
  f32[25] = input.color[1];
  f32[26] = input.color[2];
  f32[27] = 0; // _pad3

  return buf;
}
