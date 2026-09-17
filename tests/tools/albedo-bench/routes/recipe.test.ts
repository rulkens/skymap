import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleSetRecipe } from '../../../../tools/albedo-bench/plugin/routes/recipe';

function validRecipeJson(): string {
  return `${JSON.stringify(
    {
      version: 1,
      sunFit: { windowKm: 40, strideKm: 20, highPassKm: 15, minConfidence: 0.2, fillSigmaKm: 60 },
      deshade: { strength: 1, minShading: 0.3 },
      knee: { threshold: 0.6, softness: 1 },
      ice: { minAbsLatDeg: 55, fadeDeg: 8, minWhiteness: 0.6, minLuminance: 0.35 },
      grade: {
        exposureEv: 0,
        gain: [1, 1, 1],
        offset: [0, 0, 0],
        contrast: 1,
        saturation: 1,
        gamma: 1,
      },
    },
    null,
    2,
  )}\n`;
}

describe('handleSetRecipe', () => {
  it('rejects an invalid body with 400 and leaves the file unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'albedo-bench-recipe-'));
    const recipePath = join(dir, 'recipe.json');
    const original = validRecipeJson();
    writeFileSync(recipePath, original, 'utf8');

    // Missing every key but `version`.
    const result = handleSetRecipe({ body: { version: 1 }, recipePath });

    expect(result.status).toBe(400);
    expect(readFileSync(recipePath, 'utf8')).toBe(original);
    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts a valid body, writes 2-space JSON with a trailing newline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'albedo-bench-recipe-'));
    const recipePath = join(dir, 'recipe.json');
    writeFileSync(recipePath, validRecipeJson(), 'utf8');
    const body = JSON.parse(validRecipeJson()) as unknown;

    const result = handleSetRecipe({ body, recipePath });

    expect(result.status).toBe(200);
    expect(readFileSync(recipePath, 'utf8')).toBe(validRecipeJson());
    rmSync(dir, { recursive: true, force: true });
  });
});
