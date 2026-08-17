/**
 * End-to-end round-trip: recipe.json written to a real tmpdir, read back
 * through `readCuratedRecipe`, assembled by `assembleFamousGalaxiesMeta`, and
 * compared against `deriveFamousCalibration` computed from the original inputs.
 *
 * The per-stage unit tests in buildFamous.calibration.test.ts inject a fake
 * `readRecipe` callback.  This test closes the integration gap by exercising
 * the REAL `readCuratedRecipe` path — serialise → writeFileSync → existsSync
 * → readFileSync → parseRecipe — so filesystem edge cases (path construction,
 * JSON round-trip precision) surface here rather than silently in production.
 *
 * Plain `number[]` axisRatios (not Float32Array) are used so `toEqual` is
 * exact: both sides of the comparison go through the same 64-bit JS numbers
 * with no Float32 precision loss in between.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assembleFamousGalaxiesMeta, readCuratedRecipe } from '../../../tools/famous/buildFamous';
import {
  serialiseRecipe,
  type Recipe,
  type RecipeDisk,
  type RecipeCrop,
} from '../../../tools/famous-curator/plugin/recipe';
import { curatedGalaxyDir } from '../../../tools/famous-curator/plugin/paths';
import { deriveFamousCalibration } from '../../../tools/famous/deriveFamousCalibration';
import { willDeproject } from '../../../tools/famous/deprojectDisk';
import { squareDeprojectCrop } from '../../../tools/famous/squareDeprojectCrop';
import type { FamousEntry } from '../../../tools/parsers/famousSeed';

// ─── shared fixtures ──────────────────────────────────────────────────────────

const GALAXY_ID = 'ngc-roundtrip';

/** Minimal valid FamousEntry — only the fields assembleFamousGalaxiesMeta reads. */
function makeEntry(overrides: Partial<FamousEntry> = {}): FamousEntry {
  return {
    id: GALAXY_ID,
    names: ['NGC Roundtrip'],
    description: 'A fixture galaxy for round-trip testing.',
    type: 'SA(s)b',
    ra: 150.0,
    dec: 20.0,
    distanceMpc: 10.0,
    diameterKpc: 30.0,
    ...overrides,
  };
}

/** A disk annotation with axisRatio present so deproject logic is deterministic. */
const DISK: RecipeDisk = {
  centerPx: [120, 90],
  radiusPx: 40,
  paDeg: 30,
  axisRatio: 0.5,
  deproject: true,
};

/** Square crop — required by deriveFamousCalibration (width === height assumed). */
const CROP: RecipeCrop = {
  x: 50,
  y: 40,
  width: 200,
  height: 200,
  rotationDeg: 0,
};

function makeRecipe(disk?: RecipeDisk): Recipe {
  return {
    version: 1,
    id: GALAXY_ID,
    crop: CROP,
    starnet: { stride: 4, upsample: false },
    alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
    metadata: {
      sourceUrl: 'https://example.com/ngc-roundtrip',
      license: 'CC BY 4.0',
      author: 'RoundTripFixture',
    },
    processedAt: '2026-01-01T00:00:00Z',
    ...(disk !== undefined ? { disk } : {}),
  };
}

/** Write recipe.json to the expected path inside a fresh tmpdir. */
function writeRecipeToTmp(recipe: Recipe): string {
  const repoRoot = mkdtempSync(join(tmpdir(), 'famous-roundtrip-'));
  const galaxyDir = curatedGalaxyDir(repoRoot, recipe.id);
  mkdirSync(galaxyDir, { recursive: true });
  writeFileSync(resolve(galaxyDir, 'recipe.json'), serialiseRecipe(recipe));
  return repoRoot;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('calibration round-trip (real filesystem)', () => {
  it('assembles calibration matching deriveFamousCalibration after disk round-trip', () => {
    const recipe = makeRecipe(DISK);
    const repoRoot = writeRecipeToTmp(recipe);

    const entry = makeEntry();
    // Plain number[] so JSON → JS equality is exact (no Float32 rounding).
    const axisRatios = [0.6];

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, (id) =>
      readCuratedRecipe(repoRoot, id),
    );

    // Replicate the assembler's deprojection logic:
    //   effectiveAxisRatio = disk.axisRatio (0.5), not catalog value.
    //   deprojected = disk.deproject && willDeproject(0.5)
    //   and, when deprojected, calibration is derived from the SQUARE-normalised
    //   crop (matching the shipped WebP), not the recipe's annotation crop.
    const effectiveAxisRatio = DISK.axisRatio ?? axisRatios[0]!;
    const deprojected = DISK.deproject && willDeproject(effectiveAxisRatio);
    const crop = deprojected ? squareDeprojectCrop(CROP, DISK, effectiveAxisRatio) : CROP;

    const expected = deriveFamousCalibration({
      disk: DISK,
      crop,
      catalogAxisRatio: axisRatios[0]!,
      deprojected,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.calibration).toBeDefined();
    expect(result[0]!.calibration).toEqual(expected);
  });

  it('calibration is absent after round-trip when recipe has no disk', () => {
    // Proves the absence case round-trips correctly: a recipe serialised without
    // a disk block is read back and produces calibration === undefined.
    const recipe = makeRecipe(); // no disk
    const repoRoot = writeRecipeToTmp(recipe);

    const entry = makeEntry();
    const axisRatios = [0.6];

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, (id) =>
      readCuratedRecipe(repoRoot, id),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.calibration).toBeUndefined();
  });
});
