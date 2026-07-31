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
import type { GalaxyFieldGeometry } from '../../../@types/galaxy/GalaxyFieldGeometry';
import type { GenerationLayout } from '../../../@types/galaxy/GenerationLayout';

const CATEGORY_BY_CODE: readonly GalaxyCategory[] = (
  Object.keys(CATEGORY_CODE) as GalaxyCategory[]
).sort((a, b) => CATEGORY_CODE[a] - CATEGORY_CODE[b]);

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
  const disc =
    iterations(POPULATION_IDS.disk) +
    iterations(POPULATION_IDS.spiralArms) +
    iterations(POPULATION_IDS.irregularClumps);
  const modelled = bulge + bar + halo + disc;
  const share = (count: number): number => (modelled > 0 ? count / modelled : 0);

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
    starSize: f32[F.starSize]!,
    modelledStars: modelled,
  };
}
