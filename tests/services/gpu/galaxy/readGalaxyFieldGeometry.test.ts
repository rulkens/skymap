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
import { carveStarLayout } from '../../../../src/services/gpu/galaxy/carveStarLayout';
import { classifyHubbleType } from '../../../../src/services/gpu/galaxy/classifyHubbleType';
import { hiiPalette } from '../../../../src/services/gpu/galaxy/hiiPalette';
import { packGenerationUniforms } from '../../../../src/services/gpu/galaxy/packGenerationUniforms';
import { readGalaxyFieldGeometry } from '../../../../src/services/gpu/galaxy/readGalaxyFieldGeometry';
import { splitStarBudget } from '../../../../src/services/gpu/galaxy/splitStarBudget';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';

describe('readGalaxyFieldGeometry', () => {
  it('reads back the palette packGenerationUniforms wrote for that metallicity', () => {
    // 0.8 lands on the palette's upper (pink -> deep red) segment, where core
    // and halo differ from each other and from the 0.5 default — a swapped or
    // mis-addressed lane cannot coincidentally match.
    const params: GalaxyParams = { type: 'Sb', starCount: 100000, metallicity: 0.8 };
    const category = classifyHubbleType(params.type);
    const budget = splitStarBudget(category, params);
    const uniforms = packGenerationUniforms(params, budget, null);
    const layout = carveStarLayout(category, params, budget);

    const expected = hiiPalette(0.8);
    const { core, halo } = readGalaxyFieldGeometry(uniforms, layout).hiiPalette;
    for (let i = 0; i < 3; i++) {
      expect(core[i]).toBeCloseTo(expected.core[i]!, 6);
      expect(halo[i]).toBeCloseTo(expected.halo[i]!, 6);
    }
  });
});
