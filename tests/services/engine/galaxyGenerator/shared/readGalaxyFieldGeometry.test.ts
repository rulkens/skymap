/**
 * readGalaxyFieldGeometry — pins the HII palette's round trip through the
 * generation UBO, which is the analytic HII tier's ONLY colour source now that
 * it shades off `geometry.hiiPalette` rather than its own constants. Reader and
 * packer both address the lanes through `GENERATION_UBO`, so a layout change
 * moves them together; what this catches is the reader pointing at the WRONG
 * vec4 field (`extraPos`, `hiiCore` where `hiiHalo` was meant) — same type,
 * same shape, silently wrong colour.
 */
import { describe, expect, it } from 'vitest';
import { carveStarLayout } from '../../../../../src/services/engine/galaxyGenerator/shared/carveStarLayout';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import { hiiPalette } from '../../../../../src/services/engine/galaxyGenerator/shared/hiiPalette';
import { packGenerationUniforms } from '../../../../../src/services/engine/galaxyGenerator/shared/packGenerationUniforms';
import { POPULATION_IDS } from '../../../../../src/services/engine/galaxyGenerator/shared/populationIds';
import { readGalaxyFieldGeometry } from '../../../../../src/services/engine/galaxyGenerator/shared/readGalaxyFieldGeometry';
import { splitStarBudget } from '../../../../../src/services/engine/galaxyGenerator/shared/splitStarBudget';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

/** One galaxy per category, each with a bar/arm mix that makes all four shares differ. */
const BY_CATEGORY: readonly GalaxyParams[] = [
  { type: 'E1', starCount: 100000 },
  { type: 'S0', starCount: 100000 },
  { type: 'Sb', starCount: 100000, bulgeSize: 0.6, armStrength: 1.1 },
  { type: 'SBb', starCount: 100000, bulgeSize: 0.45, armStrength: 0.8 },
  { type: 'Irr', starCount: 100000 },
];

function geometryOf(params: GalaxyParams) {
  const category = classifyHubbleType(params.type);
  const budget = splitStarBudget(category, params);
  return {
    layout: carveStarLayout(category, params, budget),
    geometry: readGalaxyFieldGeometry(packGenerationUniforms(params, budget, null), params),
  };
}

describe('readGalaxyFieldGeometry', () => {
  it('reads back the palette packGenerationUniforms wrote for that metallicity', () => {
    // 0.8 lands on the palette's upper (pink -> deep red) segment, where core
    // and halo differ from each other and from the 0.5 default — a swapped or
    // mis-addressed lane cannot coincidentally match.
    const params: GalaxyParams = { type: 'Sb', starCount: 100000, metallicity: 0.8 };
    const uniforms = packGenerationUniforms(
      params,
      splitStarBudget(classifyHubbleType(params.type), params),
      null,
    );

    const expected = hiiPalette(0.8);
    const { core, halo } = readGalaxyFieldGeometry(uniforms, params).hiiPalette;
    for (let i = 0; i < 3; i++) {
      expect(core[i]).toBeCloseTo(expected.core[i]!, 6);
      expect(halo[i]).toBeCloseTo(expected.halo[i]!, 6);
    }
  });

  // The field's weights and the sprite tier's counts are two readings of one
  // table (`galaxyPopulationCountShares`). Nothing in the type system says so —
  // a bar carve or a category share changed on one side only would drift the
  // two apart silently, and the field's mixture would stop matching the bag it
  // is calibrated against.
  it.each(BY_CATEGORY)('weights $type as the carved star layout divides it', (params) => {
    const { layout, geometry } = geometryOf(params);
    const iterations = (popId: number): number =>
      layout.ranges.find((range) => range.popId === popId)?.iterations ?? 0;
    const modelled = geometry.modelledStars;
    const carved = {
      bulge: iterations(POPULATION_IDS.bulge) / modelled,
      bar: iterations(POPULATION_IDS.bar) / modelled,
      halo: iterations(POPULATION_IDS.halo) / modelled,
      disc:
        (iterations(POPULATION_IDS.disk) +
          iterations(POPULATION_IDS.spiralArms) +
          iterations(POPULATION_IDS.irregularClumps)) /
        modelled,
    };
    // One star's worth of slack per share: the layout quantises, the weights
    // do not, and that difference is the whole point of them being separate.
    const slack = 1 / modelled;
    expect(Math.abs(geometry.bulgeFraction - carved.bulge)).toBeLessThanOrEqual(slack);
    expect(Math.abs(geometry.barFraction - carved.bar)).toBeLessThanOrEqual(slack);
    expect(Math.abs(geometry.haloFraction - carved.halo)).toBeLessThanOrEqual(slack);
    expect(Math.abs(geometry.discFraction - carved.disc)).toBeLessThanOrEqual(2 * slack);
  });

  // `modelledStars` is the flux-parity anchor, and it is only honest while the
  // carved layout really does spend the whole budget on modelled populations.
  it.each(BY_CATEGORY)('anchors $type flux to every star the layout carves', (params) => {
    const { layout, geometry } = geometryOf(params);
    const carved = layout.ranges
      .filter((range) => range.popId !== POPULATION_IDS.globularStar)
      .reduce((sum, range) => sum + range.iterations, 0);
    expect(geometry.modelledStars).toBe(carved);
  });
});
