import { describe, expect, it } from 'vitest';
import type { AlbedoRecipe } from '../../../../../tools/textures/@types/AlbedoRecipe';
import { createBenchStore } from '../../../../../tools/albedo-bench/ui/store/createBenchStore';
import {
  recipeLoaded,
  setRecipeNumber,
} from '../../../../../tools/albedo-bench/ui/store/recipeSlice';

const RECIPE: AlbedoRecipe = {
  version: 1,
  sunFit: { windowKm: 20, strideKm: 10, highPassKm: 5, minConfidence: 0, fillSigmaKm: 10 },
  deshade: { strength: 1, minShading: 0.3 },
  knee: { threshold: 1, softness: 1 },
  ice: { minAbsLatDeg: 90, fadeDeg: 1, minWhiteness: 2, minLuminance: 2 },
  grade: { ev: 0, gain: [1, 1, 1], offset: [0, 0, 0], contrast: 1, saturation: 1, gamma: 1 },
};

function loadedStore() {
  const store = createBenchStore();
  store.dispatch(recipeLoaded(RECIPE));
  return store;
}

describe('setRecipeNumber', () => {
  // The field refit is keyed on `sunFit`'s identity; a grade edit that
  // replaced it would refit on every colour slider.
  it('a grade edit sets one channel and keeps sunFit the same object', () => {
    const store = loadedStore();
    const before = store.getState().recipe.recipe!;
    store.dispatch(setRecipeNumber({ path: ['grade', 'gain', 1], value: 1.5 }));
    const after = store.getState().recipe.recipe!;
    expect(after.grade.gain).toEqual([1, 1.5, 1]);
    expect(after.sunFit).toBe(before.sunFit);
  });

  it('a sunFit edit replaces sunFit, so the field refits', () => {
    const store = loadedStore();
    const before = store.getState().recipe.recipe!;
    store.dispatch(setRecipeNumber({ path: ['sunFit', 'strideKm'], value: 30 }));
    const after = store.getState().recipe.recipe!;
    expect(after.sunFit).toEqual({ ...RECIPE.sunFit, strideKm: 30 });
    expect(after.sunFit).not.toBe(before.sunFit);
  });
});
