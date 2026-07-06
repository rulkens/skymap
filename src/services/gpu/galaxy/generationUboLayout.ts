/**
 * generationUboLayout — `GENERATION_UBO`, the single offset authority for
 * the GPU galaxy-generation uniform buffer.
 *
 * The alternative — scattering `f32[17] = barLength` / `f32[41] =
 * globularBright` literals across `packGenerationUniforms.ts`, the WGSL
 * struct (Task 3), and every test that reads a lane back out — is exactly
 * the braid this file exists to cut. Three independent authors (the packer,
 * the shader, the test) would each need to derive the same byte math from
 * the field inventory by hand, and a single off-by-one in any one of them
 * produces a silent GPU/CPU mismatch: no compiler error, just a wrong
 * float landing at the wrong lane. Centralising the arithmetic here means
 * every offset is *computed once* from the field inventory below and named,
 * not re-derived — the packer writes through `GENERATION_UBO`, the tests
 * read through it, and the WGSL struct (Task 3) is hand-mirrored against
 * this file's declaration order as its one required manual step.
 *
 * Layout rule: every field is vec4-aligned. Scalars pack four-per-vec4 in
 * declaration order within their group, with the group's own trailing lanes
 * left as zero-filled padding (never reused by the next group) — that's
 * what makes "vec4-aligned" true for every *group*, not just the buffer as
 * a whole, matching a WGSL `struct` whose fields are laid out the same way
 * by the language's own alignment rules. A field that is itself vec4-valued
 * (a palette colour, a position, a fixed-size array record) gets its own
 * `arrays` entry instead — `f32`/`u32` are for single-lane scalars only, so
 * a reader never has to guess whether a given name is one float or four.
 *
 * Field groups, in the order the WGSL struct (Task 3) must mirror:
 * scale, asymmetry, bar, warp, dust, arms, misc, hiiCore/hiiHalo palette
 * vec4s, extraPos/extraRot transform vec4s, the u32 group, then the five
 * fixed-size arrays (armTable, clumpCenters, cloudCenters, starRanges,
 * dustRanges). If porting the generator reveals a missing field, *append*
 * it to the relevant group/array — never renumber an existing field
 * mid-branch, since that would silently desync anything already reading a
 * previously-assigned offset.
 */

/** Per-arm personality/meander + clump + wave records, `armCount`'s max. */
const MAX_ARMS = 8;
/** Number of vec4 slots per arm-table record (16 floats: asymmetry + clump + wave lanes). */
const ARM_RECORD_STRIDE_VEC4 = 4;
/** `buildIrregularClumps`'s fixed clump-centre count (irregularClumps.ts). */
const NUM_IRR_CLUMPS = 7;
/** `buildLenticularDust`'s fixed cloud-centre count (lenticularDust.ts). */
const LENT_CLOUDS = 34;
/** `carveStarLayout`'s population count never exceeds its own spec table. */
const MAX_STAR_RANGES = 7;
/** `carveDustLayout`'s population count never exceeds its own spec table. */
const MAX_DUST_RANGES = 5;

type ArrayRegion = { readonly offsetVec4: number; readonly countVec4: number };

/**
 * Assign one word (a 4-byte f32 or u32 lane — the two share the same byte
 * layout, only the typed-array view reading them differs) to each name, in
 * order, then pad the shared cursor up to the next vec4 boundary so the
 * *next* group starts vec4-aligned. Returns a concretely-keyed object (not
 * a `Record<string, number>`) so callers get real property types back
 * instead of `noUncheckedIndexedAccess`'s `number | undefined` — every
 * field name here is known at the call site, so there is nothing to guard.
 */
function scalarGroup<Names extends readonly string[]>(
  cursor: { value: number },
  names: Names,
): { [K in Names[number]]: number } {
  const rec = {} as { [K in Names[number]]: number };
  for (const name of names) {
    (rec as Record<string, number>)[name] = cursor.value;
    cursor.value += 1;
  }
  cursor.value = Math.ceil(cursor.value / 4) * 4;
  return rec;
}

/** Reserve one vec4 (already aligned, since every group pads up to one). */
function vec4Field(cursor: { value: number }): ArrayRegion {
  const offsetVec4 = cursor.value / 4;
  cursor.value += 4;
  return { offsetVec4, countVec4: 1 };
}

/** Reserve `countVec4` contiguous vec4 slots for a fixed-size array field. */
function vec4Array(cursor: { value: number }, countVec4: number): ArrayRegion {
  const offsetVec4 = cursor.value / 4;
  cursor.value += countVec4 * 4;
  return { offsetVec4, countVec4 };
}

function buildLayout() {
  const cursor = { value: 0 };

  const scale = scalarGroup(cursor, [
    'outerRadius',
    'diskScaleLen',
    'bulgeRadius',
    'diskHeight',
    'grainScale',
    'starSize',
  ] as const);

  const asymmetry = scalarGroup(cursor, [
    'flattening',
    'asymmetry',
    'lopsidedAmp',
    'lopsidedAngle',
    'bulgeAxisZ',
    'cosBulge',
    'sinBulge',
    'bulgeConcentration',
  ] as const);

  const bar = scalarGroup(cursor, ['barLength', 'cosBar', 'sinBar'] as const);

  const warp = scalarGroup(cursor, ['warpStrength', 'warpTwist', 'warpStartRadius'] as const);

  const dust = scalarGroup(cursor, [
    'dustAmount',
    'dustNoiseAmt',
    'noiseFreq',
    'clumpAmount',
    'ringRadius',
    'ringWidth',
    'ringStrength',
  ] as const);

  const arms = scalarGroup(cursor, [
    'subArmAmount',
    'waveAmount',
    'armStartRadius',
    'armWidthFactor',
    'armFullRadius',
    'armInnerRampW',
    'weightSum',
  ] as const);

  const misc = scalarGroup(cursor, [
    'globularSize',
    'globularBright',
    'youngFraction',
    'hiiIntensity',
    'irrBarOffset',
    'extraScale',
  ] as const);

  const hiiCore = vec4Field(cursor);
  const hiiHalo = vec4Field(cursor);
  const extraPos = vec4Field(cursor);
  const extraRot = vec4Field(cursor);

  const u32 = scalarGroup(cursor, [
    'seed',
    'noiseSeed',
    'category',
    'numArms',
    'starCapacity',
    'dustCapacity',
    'starRangeCount',
    'dustRangeCount',
  ] as const);

  const armTable = vec4Array(cursor, MAX_ARMS * ARM_RECORD_STRIDE_VEC4);
  const clumpCenters = vec4Array(cursor, NUM_IRR_CLUMPS);
  const cloudCenters = vec4Array(cursor, LENT_CLOUDS);
  const starRanges = vec4Array(cursor, MAX_STAR_RANGES);
  const dustRanges = vec4Array(cursor, MAX_DUST_RANGES);

  return {
    byteLength: cursor.value * 4,
    f32: { ...scale, ...asymmetry, ...bar, ...warp, ...dust, ...arms, ...misc },
    u32,
    arrays: {
      hiiCore,
      hiiHalo,
      extraPos,
      extraRot,
      armTable,
      clumpCenters,
      cloudCenters,
      starRanges,
      dustRanges,
    },
    armTableLayout: {
      strideVec4: ARM_RECORD_STRIDE_VEC4, // number of vec4 slots per arm record (16 floats)
      asymLanes: [0, 1, 2, 3, 4, 5, 6], // phase, pitch, weight, fadeRadius, meanderAmp, meanderFreq, meanderPhase
      clumpLanes: [8, 9, 10, 11], // clumpF1, clumpP1, clumpF2, clumpP2
      waveLanes: [12, 13, 14, 15], // waveF1, waveP1, waveF2, waveP2
    },
  };
}

export const GENERATION_UBO = Object.freeze(buildLayout());
