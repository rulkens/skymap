/**
 * generationUboLayout — WIRE-FORMAT CONTRACT: `GENERATION_UBO` is the single
 * offset authority for the GPU galaxy-generation uniform buffer, and its
 * declaration order is what the WGSL struct is hand-mirrored against — no
 * compiler enforces that seam, so an off-by-one here is a silent GPU/CPU
 * mismatch, a wrong float in the wrong lane.
 *
 * Layout rule: every field is vec4-aligned. Scalars pack four-per-vec4 in
 * declaration order within their group; each group pads its own trailing
 * lanes to the next vec4 boundary (never reused by the next group), matching
 * how a WGSL `struct` aligns its own fields. A field that is itself
 * vec4-valued (a palette colour, a position, a fixed-size array record) gets
 * its own `arrays` entry — `f32`/`u32` are single-lane scalars only.
 *
 * Field groups, in WGSL struct order: scale, asymmetry, bar, warp, dust,
 * arms, misc, hiiCore/hiiHalo/extraPos/extraRot vec4s, the u32 group, then
 * the five fixed-size arrays (armTable, clumpCenters, cloudCenters,
 * starRanges, dustRanges). *Append* a new field to its group/array — never
 * renumber an existing one, which would silently desync any offset already
 * read elsewhere.
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
      // phase, pitch, weight, fadeRadius, meanderAmp, meanderFreq, meanderPhase, age — lane 7
      // (age) draws off the same asym stream as lanes 0-6, after fadeRadius.
      asymLanes: [0, 1, 2, 3, 4, 5, 6, 7],
      clumpLanes: [8, 9, 10, 11], // clumpF1, clumpP1, clumpF2, clumpP2
      waveLanes: [12, 13, 14, 15], // waveF1, waveP1, waveF2, waveP2
    },
  };
}

export const GENERATION_UBO = Object.freeze(buildLayout());
