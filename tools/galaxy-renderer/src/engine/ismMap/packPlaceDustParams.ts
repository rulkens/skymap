/**
 * packPlaceDustParams — the uniform placeDust.wesl reads. THAT FILE'S
 * `PlaceDustParams` IS THE OFFSET AUTHORITY (same discipline
 * packIsmMapFluidConstants.ts documents for its own struct).
 *
 * Unlike packIsmMapCdfParams.ts's all-f32 convention, the u32 fields here
 * travel as REAL u32s: `seed` is a normalized int32 bit pattern
 * (normalizeGenerationSeed.ts) that can exceed f32's 24-bit exact-integer
 * range, so this packer aliases one ArrayBuffer with both a Uint32Array and
 * a Float32Array view rather than casting everything through f32.
 */

/** Float count of placeDust.wesl's `PlaceDustParams` — 8 vec4 rows. */
export const PLACE_DUST_PARAMS_FLOATS = 32;

/** Byte size of the params struct, for `createBuffer`. */
export const PLACE_DUST_PARAMS_BUFFER_SIZE = PLACE_DUST_PARAMS_FLOATS * 4;

export type PlaceDustParamsInput = {
  readonly seed: number;
  readonly count: number;
  readonly childrenPerComplex: number;
  readonly generatorIsFluid: boolean;
  readonly dustOffset: number;
  readonly gridRings: number;
  readonly gridAz: number;
  readonly rMin: number;
  readonly rMax: number;
  readonly complexSpread: number;
  readonly elongation: number;
  readonly sigmaZComplex: number;
  readonly discWeightSum: number;
  readonly sizeMin: number;
  readonly sizeMax: number;
  /** Component i's radial sigma (dustSigmaR(i, shape), i in 0..4) — see discSurfaceFit.ts. */
  readonly discSigmaR: readonly [number, number, number, number];
  readonly warpStrength: number;
  readonly warpTwist: number;
  readonly warpStartRadius: number;
  readonly outerRadius: number;
  readonly extinctionRgb: readonly [number, number, number];
};

export function packPlaceDustParams(input: PlaceDustParamsInput): ArrayBuffer {
  const buf = new ArrayBuffer(PLACE_DUST_PARAMS_BUFFER_SIZE);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);

  // `>>> 0`: reinterpret the signed int32 seed as the u32 bit pattern the
  // shader's genRand hashes — same site normalizeGenerationSeed.ts's own
  // header points to ("the UBO's >>> 0 reinterpretation happens at the pack
  // site").
  u32[0] = input.seed >>> 0;
  u32[1] = input.count;
  u32[2] = input.childrenPerComplex;
  u32[3] = input.generatorIsFluid ? 1 : 0;

  u32[4] = input.dustOffset;
  u32[5] = input.gridRings;
  u32[6] = input.gridAz;
  u32[7] = 0; // _padU0

  f32[8] = input.rMin;
  f32[9] = input.rMax;
  f32[10] = input.complexSpread;
  f32[11] = input.elongation;

  f32[12] = input.sigmaZComplex;
  f32[13] = input.discWeightSum;
  f32[14] = input.sizeMin;
  f32[15] = input.sizeMax;

  f32[16] = input.discSigmaR[0];
  f32[17] = input.discSigmaR[1];
  f32[18] = input.discSigmaR[2];
  f32[19] = input.discSigmaR[3];

  f32[20] = input.warpStrength;
  f32[21] = input.warpTwist;
  f32[22] = input.warpStartRadius;
  f32[23] = input.outerRadius;

  f32[24] = input.extinctionRgb[0];
  f32[25] = input.extinctionRgb[1];
  f32[26] = input.extinctionRgb[2];
  f32[27] = 0; // _pad1

  return buf;
}
