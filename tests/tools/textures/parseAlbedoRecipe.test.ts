/** A malformed recipe must fail loudly, naming the exact key path, rather
 *  than silently coercing into a NaN that only surfaces as a bad pixel. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseAlbedoRecipe } from '../../../tools/textures/parseAlbedoRecipe';

const RECIPE_PATH = join(__dirname, '../../../tools/textures/surfaceBodies/marsAlbedoRecipe.json');

function validRecipe(): Record<string, unknown> {
  return JSON.parse(readFileSync(RECIPE_PATH, 'utf8')) as Record<string, unknown>;
}

describe('parseAlbedoRecipe', () => {
  it('parses the committed Mars recipe', () => {
    const json = readFileSync(RECIPE_PATH, 'utf8');
    const recipe = parseAlbedoRecipe(json);
    expect(recipe.version).toBe(1);
    expect(recipe.sunFit).toEqual({
      windowKm: 40,
      strideKm: 20,
      highPassKm: 15,
      minConfidence: 0.2,
      fillSigmaKm: 60,
    });
    expect(recipe.deshade).toEqual({ strength: 1, minShading: 0.3 });
    expect(recipe.knee).toEqual({ threshold: 0.6, softness: 1 });
    expect(recipe.ice).toEqual({
      minAbsLatDeg: 55,
      fadeDeg: 8,
      minWhiteness: 0.6,
      minLuminance: 0.35,
    });
    expect(recipe.grade).toEqual({
      exposureEv: 0,
      gain: [1, 1, 1],
      offset: [0, 0, 0],
      contrast: 1,
      saturation: 1,
      gamma: 1,
    });
  });

  it('rejects a missing key, naming the path', () => {
    const recipe = validRecipe();
    delete (recipe.deshade as Record<string, unknown>).strength;
    expect(() => parseAlbedoRecipe(JSON.stringify(recipe))).toThrow('$.deshade.strength');
  });

  it('rejects an extra key, naming the path', () => {
    const recipe = validRecipe();
    (recipe.knee as Record<string, unknown>).extra = 1;
    expect(() => parseAlbedoRecipe(JSON.stringify(recipe))).toThrow('$.knee.extra');
  });

  it('rejects a NaN-producing non-finite number, naming the path', () => {
    const recipe = validRecipe();
    (recipe.ice as Record<string, unknown>).fadeDeg = Number.POSITIVE_INFINITY;
    // Infinity survives JSON.stringify as `null`, which still fails the
    // finite-number check at the same path.
    expect(() => parseAlbedoRecipe(JSON.stringify(recipe))).toThrow('$.ice.fadeDeg');
  });

  it('rejects a 2-tuple gain, naming the path', () => {
    const recipe = validRecipe();
    (recipe.grade as Record<string, unknown>).gain = [1, 1];
    expect(() => parseAlbedoRecipe(JSON.stringify(recipe))).toThrow('$.grade.gain');
  });
});
