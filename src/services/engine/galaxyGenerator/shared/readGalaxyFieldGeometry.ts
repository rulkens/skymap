/**
 * readGalaxyFieldGeometry — reads the analytic field's inputs back out of the
 * bytes `packGenerationUniforms` just produced.
 *
 * Reading the PACKED buffer rather than re-deriving from `GalaxyParams` is the
 * whole point: `cosBar`/`sinBar` and `cosBulge`/`sinBulge` are single draws off
 * the packer's `mainStream`/`asymStream`, so any second derivation would need
 * to replay those streams in order and would misalign the field's bar against
 * the sprites' the moment the draw order moved. The population weights are the
 * exception — they are a table, not a draw, so they come from `params`.
 */
import { CATEGORY_CODE } from './packGenerationUniforms';
import { galaxyPopulationFractions } from './galaxyPopulationFractions';
import { GENERATION_UBO } from './generationUboLayout';
import { totalStarBudget } from './totalStarBudget';
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldGeometry } from '../../../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { Vec3 } from '../../../../@types/math/Vec3';

const CATEGORY_BY_CODE: readonly GalaxyCategory[] = (
  Object.keys(CATEGORY_CODE) as GalaxyCategory[]
).sort((a, b) => CATEGORY_CODE[a] - CATEGORY_CODE[b]);

/**
 * Reads one `gen.armTable` record — 16 floats at `armBase + arm*16`, in the
 * exact order `packGenerationUniforms` writes. Lanes 0-6 are what
 * `armStarSample` consumes; lane 7 (`age`) is analytic-field-only, never
 * read by the sprite shader.
 */
function readArmRecord(f32: Float32Array, armBase: number, arm: number): GalaxyFieldArmRecord {
  const base = armBase + arm * 16;
  return {
    phase: f32[base]!,
    pitch: f32[base + 1]!,
    weight: f32[base + 2]!,
    fadeRadius: f32[base + 3]!,
    meanderAmp: f32[base + 4]!,
    meanderFreq: f32[base + 5]!,
    meanderPhase: f32[base + 6]!,
    age: f32[base + 7]!,
    clumpF1: f32[base + 8]!,
    clumpP1: f32[base + 9]!,
    clumpF2: f32[base + 10]!,
    clumpP2: f32[base + 11]!,
    waveF1: f32[base + 12]!,
    waveP1: f32[base + 13]!,
    waveF2: f32[base + 14]!,
    waveP2: f32[base + 15]!,
  };
}

export function readGalaxyFieldGeometry(
  genUniforms: ArrayBuffer,
  params: GalaxyParams,
): GalaxyFieldGeometry {
  const f32 = new Float32Array(genUniforms);
  const u32 = new Uint32Array(genUniforms);
  const F = GENERATION_UBO.f32;

  const category = CATEGORY_BY_CODE[u32[GENERATION_UBO.u32.category]!] ?? 'spiral';
  // Arms fold into the disc: the ridge's flux is derived from measured
  // arm/interarm contrast against the disc profile (see `pushArmRidges` in
  // galaxyFieldMixture.ts), so there is no separate arm weight to carry.
  // Globular clusters are outside the mixture entirely — 90-star knots at
  // random radii are not a smooth field — and outside these shares with it.
  const fractions = galaxyPopulationFractions(category, params);

  // The packer stores a colour in a vec4's xyz with w unused, so the tint is
  // the first three lanes — `GalaxyFieldComponent.color` and `gen.hiiCore`
  // are the same convention (linear RGB, 0..1, unpremultiplied), which is why
  // the analytic field can take these bytes untouched.
  const readColor = (offsetVec4: number): Vec3 => {
    const base = offsetVec4 * 4;
    return [f32[base]!, f32[base + 1]!, f32[base + 2]!];
  };

  const numArms = u32[GENERATION_UBO.u32.numArms]!;
  const armBase = GENERATION_UBO.arrays.armTable.offsetVec4 * 4;
  const arms: GalaxyFieldArmRecord[] = [];
  for (let a = 0; a < numArms; a++) arms.push(readArmRecord(f32, armBase, a));

  return {
    category,
    outerRadius: f32[F.outerRadius]!,
    diskScaleLen: f32[F.diskScaleLen]!,
    bulgeRadius: f32[F.bulgeRadius]!,
    diskHeight: f32[F.diskHeight]!,
    flattening: f32[F.flattening]!,
    bulgeAxisZ: f32[F.bulgeAxisZ]!,
    bulgeTiltRad: Math.atan2(f32[F.sinBulge]!, f32[F.cosBulge]!),
    bulgeConcentration: f32[F.bulgeConcentration]!,
    barLength: f32[F.barLength]!,
    barTiltRad: Math.atan2(f32[F.sinBar]!, f32[F.cosBar]!),
    warpStrength: f32[F.warpStrength]!,
    warpTwist: f32[F.warpTwist]!,
    warpStartRadius: f32[F.warpStartRadius]!,
    discFraction: fractions.disk + fractions.arm,
    bulgeFraction: fractions.bulge,
    barFraction: fractions.bar,
    haloFraction: fractions.halo,
    numArms,
    armStartRadius: f32[F.armStartRadius]!,
    armInnerRampW: f32[F.armInnerRampW]!,
    armFullRadius: f32[F.armFullRadius]!,
    armWidthFactor: f32[F.armWidthFactor]!,
    waveAmount: f32[F.waveAmount]!,
    clumpAmount: f32[F.clumpAmount]!,
    youngFraction: f32[F.youngFraction]!,
    hiiPalette: {
      core: readColor(GENERATION_UBO.arrays.hiiCore.offsetVec4),
      halo: readColor(GENERATION_UBO.arrays.hiiHalo.offsetVec4),
    },
    arms,
    starSize: f32[F.starSize]!,
    modelledStars: totalStarBudget(params),
    seed: u32[GENERATION_UBO.u32.seed]!,
  };
}
