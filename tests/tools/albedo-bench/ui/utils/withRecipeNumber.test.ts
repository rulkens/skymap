import { describe, expect, it } from 'vitest';
import type { AlbedoRecipe } from '../../../../../tools/textures/@types/AlbedoRecipe';
import { withRecipeNumber } from '../../../../../tools/albedo-bench/ui/utils/withRecipeNumber';

const RECIPE: AlbedoRecipe = {
  version: 1,
  sunFit: { windowKm: 20, strideKm: 10, highPassKm: 5, minConfidence: 0, fillSigmaKm: 10 },
  deshade: { strength: 1, minShading: 0.3 },
  knee: { threshold: 1, softness: 1 },
  ice: { minAbsLatDeg: 90, fadeDeg: 1, minWhiteness: 2, minLuminance: 2 },
  grade: { ev: 0, gain: [1, 1, 1], offset: [0, 0, 0], contrast: 1, saturation: 1, gamma: 1 },
};

describe('withRecipeNumber', () => {
  it('replaces one channel of a grade tuple and leaves the input untouched', () => {
    const out = withRecipeNumber(RECIPE, ['grade', 'gain', 1], 1.5);
    expect(out.grade.gain).toEqual([1, 1.5, 1]);
    expect(out.grade.offset).toBe(RECIPE.grade.offset);
    expect(RECIPE.grade.gain).toEqual([1, 1, 1]);
  });

  it('replaces a scalar leaf without touching its siblings', () => {
    const out = withRecipeNumber(RECIPE, ['sunFit', 'strideKm'], 30);
    expect(out.sunFit).toEqual({ ...RECIPE.sunFit, strideKm: 30 });
    expect(out.deshade).toBe(RECIPE.deshade);
  });
});
