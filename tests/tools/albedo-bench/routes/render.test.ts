/**
 * handleRender's `adjusted` variant must be exactly what a caller building
 * the same pieces by hand would get (design §10/§11 "same pixels"): it fits
 * over exactly `box` (not some other region) and assembles the decorator
 * identically to a manual `albedoRecipeImagerySource(...).readBox` call.
 */
import { describe, expect, it } from 'vitest';
import type { AlbedoRecipe } from '../../../../tools/textures/AlbedoRecipe';
import { albedoRecipeImagerySource } from '../../../../tools/textures/albedoRecipeImagerySource';
import { fitSunField } from '../../../../tools/textures/fitSunField';
import { handleRender } from '../../../../tools/albedo-bench/plugin/routes/render';
import {
  analyticHeightSource,
  analyticImagerySource,
} from '../../../fixtures/textures/albedoFakes';

// Matches albedoFakes' own hardcoded fit radius (a real caller looks its
// planet's radius up once and threads it through; these fakes fix one).
const RADIUS_M = 3_390_000;

const SUN_FIT: AlbedoRecipe['sunFit'] = {
  windowKm: 20,
  strideKm: 10,
  highPassKm: 5,
  minConfidence: 0,
  fillSigmaKm: 10,
};

const RECIPE: AlbedoRecipe = {
  version: 1,
  sunFit: SUN_FIT,
  deshade: { strength: 1, minShading: 0.3 },
  knee: { threshold: 1, softness: 1 }, // above 1: never engages
  ice: { minAbsLatDeg: 90, fadeDeg: 1, minWhiteness: 2, minLuminance: 2 }, // never engages
  grade: {
    ev: 0,
    gain: [1, 1, 1],
    offset: [0, 0, 0],
    contrast: 1,
    saturation: 1,
    gamma: 1,
  },
};

describe('handleRender', () => {
  it("'adjusted' bytes equal the decorator's readBox with a field fitted over a 3x larger region, inside the box", async () => {
    const height = analyticHeightSource();
    const imagery = analyticImagerySource(height, [0.5, 0.45, 0.4], [0.8, -0.3]);
    const box = { west: 9.5, east: 10.5, south: 19.5, north: 20.5 };
    const bigRegion = { west: 8.5, east: 11.5, south: 18.5, north: 21.5 }; // 3x box, same centre
    const px = 32;

    const bigField = await fitSunField({
      imagery,
      height,
      region: bigRegion,
      sunFit: SUN_FIT,
      radiusM: RADIUS_M,
    });
    const { version: _version, sunFit: _sunFit, ...pixelApply } = RECIPE;
    const expected = await albedoRecipeImagerySource(imagery, height, bigField, pixelApply).readBox(
      box,
      px,
      px,
    );
    expect(expected).not.toBeNull();

    const actual = await handleRender({
      body: { box, px, recipe: RECIPE, variant: 'adjusted' },
      deps: {
        imagery,
        height,
        radiusM: RADIUS_M,
        getField: (region, sunFit) =>
          fitSunField({ imagery, height, region, sunFit, radiusM: RADIUS_M }),
      },
    });

    expect(actual).toEqual(expected);
  });

  it("'original' returns the primary source's bytes untouched", async () => {
    const height = analyticHeightSource();
    const imagery = analyticImagerySource(height, [0.5, 0.45, 0.4], [0.8, -0.3]);
    const box = { west: 9.5, east: 10.5, south: 19.5, north: 20.5 };
    const px = 8;

    const expected = await imagery.readBox(box, px, px);
    const actual = await handleRender({
      body: { box, px, recipe: RECIPE, variant: 'original' },
      deps: {
        imagery,
        height,
        radiusM: RADIUS_M,
        getField: (region, sunFit) =>
          fitSunField({ imagery, height, region, sunFit, radiusM: RADIUS_M }),
      },
    });

    expect(actual).toEqual(expected);
  });
});
