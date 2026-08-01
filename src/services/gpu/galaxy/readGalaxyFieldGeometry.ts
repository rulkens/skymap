/**
 * readGalaxyFieldGeometry — reads the analytic field's inputs back out of the
 * bytes `packGenerationUniforms` just produced, plus the carved star layout.
 *
 * Reading the PACKED buffer rather than re-deriving from `GalaxyParams` is the
 * whole point: `cosBar`/`sinBar` and `cosBulge`/`sinBulge` are single draws off
 * the packer's `mainStream`/`asymStream`, so any second derivation would need
 * to replay those streams in order and would misalign the field's bar against
 * the sprites' the moment the draw order moved.
 */
import { CATEGORY_CODE } from './packGenerationUniforms';
import { GENERATION_UBO } from './generationUboLayout';
import { POPULATION_IDS } from './populationIds';
import type { GalaxyCategory } from '../../../@types/galaxy/GalaxyCategory';
import type { GalaxyFieldArmRecord } from '../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldGeometry } from '../../../@types/galaxy/GalaxyFieldGeometry';
import type { GenerationLayout } from '../../../@types/galaxy/GenerationLayout';

const CATEGORY_BY_CODE: readonly GalaxyCategory[] = (
  Object.keys(CATEGORY_CODE) as GalaxyCategory[]
).sort((a, b) => CATEGORY_CODE[a] - CATEGORY_CODE[b]);

/**
 * Reads one `gen.armTable` record — 16 floats at `armBase + arm*16`, in the
 * exact order `packGenerationUniforms` writes and `armStarSample` consumes
 * (lane 7 is padding, never a field).
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
  starLayout: GenerationLayout,
): GalaxyFieldGeometry {
  const f32 = new Float32Array(genUniforms);
  const u32 = new Uint32Array(genUniforms);
  const F = GENERATION_UBO.f32;

  const iterations = (popId: number): number =>
    starLayout.ranges.find((range) => range.popId === popId)?.iterations ?? 0;

  // Globular-cluster stars are left out of the denominator as well as the
  // mixture: they are 90-star knots at random radii, not a smooth field.
  const bulge = iterations(POPULATION_IDS.bulge);
  const bar = iterations(POPULATION_IDS.bar);
  const halo = iterations(POPULATION_IDS.halo);
  const armStars = iterations(POPULATION_IDS.spiralArms);
  // Un-folded from `disc`: pushArmRidges carries this share itself now, so
  // leaving armStars in the disc numerator would double-count it once ridge
  // blobs exist alongside the axisymmetric disc (see galaxyFieldMixture.ts).
  const disc = iterations(POPULATION_IDS.disk) + iterations(POPULATION_IDS.irregularClumps);
  const modelled = bulge + bar + halo + disc + armStars;
  const share = (count: number): number => (modelled > 0 ? count / modelled : 0);

  const numArms = u32[GENERATION_UBO.u32.numArms]!;
  const armBase = GENERATION_UBO.arrays.armTable.offsetVec4 * 4;
  const arms: GalaxyFieldArmRecord[] = [];
  for (let a = 0; a < numArms; a++) arms.push(readArmRecord(f32, armBase, a));

  return {
    category: CATEGORY_BY_CODE[u32[GENERATION_UBO.u32.category]!] ?? 'spiral',
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
    discFraction: share(disc),
    bulgeFraction: share(bulge),
    barFraction: share(bar),
    haloFraction: share(halo),
    armFraction: share(armStars),
    numArms,
    armStartRadius: f32[F.armStartRadius]!,
    armInnerRampW: f32[F.armInnerRampW]!,
    armFullRadius: f32[F.armFullRadius]!,
    armWidthFactor: f32[F.armWidthFactor]!,
    waveAmount: f32[F.waveAmount]!,
    clumpAmount: f32[F.clumpAmount]!,
    youngFraction: f32[F.youngFraction]!,
    arms,
    starSize: f32[F.starSize]!,
    modelledStars: modelled,
  };
}
