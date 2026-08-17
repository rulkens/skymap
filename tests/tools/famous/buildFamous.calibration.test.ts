/**
 * Tests for assembleFamousGalaxiesMeta and readCuratedRecipe in buildFamous.
 *
 * assembleFamousGalaxiesMeta is a pure function injected with a readRecipe callback,
 * so tests can exercise the calibration-attach logic without touching the
 * filesystem.  readCuratedRecipe is tested separately with a tmp repo root
 * to cover the missing-file and corrupt-recipe failure modes.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assembleFamousGalaxiesMeta, readCuratedRecipe } from '../../../tools/famous/buildFamous';
import { deriveFamousCalibration } from '../../../tools/famous/deriveFamousCalibration';
import { squareDeprojectCrop } from '../../../tools/famous/squareDeprojectCrop';
import type { Recipe, RecipeDisk } from '../../../tools/famous-curator/plugin/recipe';
import type { FamousEntry } from '../../../tools/parsers/famousSeed';

// ─── fixtures ─────────────────────────────────────────────────────────────────

/** Minimal valid FamousEntry.  Provide only the fields assembleFamousGalaxiesMeta reads. */
function makeEntry(overrides: Partial<FamousEntry> = {}): FamousEntry {
  return {
    id: 'm31',
    names: ['M31', 'NGC 224'],
    description: 'The Andromeda Galaxy.',
    type: 'SA(s)b',
    ra: 10.68,
    dec: 41.27,
    distanceMpc: 0.785,
    diameterKpc: 60,
    ...overrides,
  };
}

/** Minimal valid RecipeDisk. */
function makeDisk(overrides: Partial<RecipeDisk> = {}): RecipeDisk {
  return {
    centerPx: [256, 256],
    radiusPx: 64,
    paDeg: 30,
    deproject: true,
    axisRatio: 0.5,
    ...overrides,
  };
}

/** Minimal valid Recipe with an optional disk. */
function makeRecipe(disk?: RecipeDisk): Recipe {
  return {
    version: 1,
    id: 'm31',
    crop: { x: 128, y: 128, width: 256, height: 256, rotationDeg: 0 },
    starnet: { stride: 4, upsample: true },
    alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
    metadata: { sourceUrl: 'https://example.com', license: 'CC BY', author: 'Test' },
    processedAt: '2026-01-01T00:00:00Z',
    ...(disk !== undefined ? { disk } : {}),
  };
}

// ─── assembleFamousGalaxiesMeta ───────────────────────────────────────────────────────

describe('assembleFamousGalaxiesMeta', () => {
  it('attaches calibration when a recipe has a disk', () => {
    const disk = makeDisk();
    const recipe = makeRecipe(disk);
    const entry = makeEntry();
    // axisRatios[0] = 0.6 (catalog value passed through to derivation).
    const axisRatios = new Float32Array([0.6]);

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, () => recipe);

    // deprojected = disk.deproject && willDeproject(disk.axisRatio ?? axisRatios[0])
    // = true && willDeproject(0.5) = true (0.5 is a tilted, valid disk in (0, 1)).
    // The build derives calibration from the SQUARE-normalised crop (matching the
    // shipped WebP), so the expectation must normalise the same way.
    const expected = deriveFamousCalibration({
      disk,
      crop: squareDeprojectCrop(recipe.crop, disk, 0.5),
      catalogAxisRatio: 0.6,
      deprojected: true,
    });
    expect(result[0]!.calibration).toBeDefined();
    expect(result[0]!.calibration).toEqual(expected);
  });

  it('uses disk.axisRatio for willDeproject when present', () => {
    // disk.axisRatio=0.5 controls deprojection, not the catalog 0.6.
    const disk = makeDisk({ axisRatio: 0.5, deproject: true });
    const recipe = makeRecipe(disk);
    const entry = makeEntry();
    const axisRatios = new Float32Array([0.6]);

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, () => recipe);

    // disk.axisRatio (0.5) gates willDeproject → deprojected = true.
    expect(result[0]!.calibration!.deprojected).toBe(true);
  });

  it('falls back to catalog axisRatio for willDeproject when disk.axisRatio absent', () => {
    // disk.axisRatio absent → effectiveAxisRatio = axisRatios[0] = 0.6.
    const disk = makeDisk({ axisRatio: undefined, deproject: true });
    const recipe = makeRecipe(disk);
    const entry = makeEntry();
    const axisRatios = new Float32Array([0.6]);

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, () => recipe);

    // disk.axisRatio absent → effectiveAxisRatio = catalog 0.6; willDeproject(0.6)
    // = true → deprojected.
    expect(result[0]!.calibration!.deprojected).toBe(true);
  });

  it('omits calibration when the recipe has no disk', () => {
    const recipe = makeRecipe(); // no disk
    const entry = makeEntry();
    const axisRatios = new Float32Array([0.6]);

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, () => recipe);

    expect(result[0]!.calibration).toBeUndefined();
  });

  it('omits calibration when readRecipe returns undefined', () => {
    const entry = makeEntry();
    const axisRatios = new Float32Array([0.6]);

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, () => undefined);

    expect(result[0]!.calibration).toBeUndefined();
  });

  it('copies base meta fields correctly (id, names, description, type)', () => {
    const entry = makeEntry({
      id: 'ngc-5128',
      names: ['NGC 5128', 'Centaurus A'],
      description: 'Blurb.',
      type: 'S0p',
    });
    const axisRatios = new Float32Array([0.7]);

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, () => undefined);

    expect(result[0]!.id).toBe('ngc-5128');
    expect(result[0]!.names).toEqual(['NGC 5128', 'Centaurus A']);
    expect(result[0]!.description).toBe('Blurb.');
    expect(result[0]!.type).toBe('S0p');
  });

  it('includes commonName when present on the entry', () => {
    const entry = makeEntry({ commonName: 'Andromeda Galaxy' });
    const axisRatios = new Float32Array([0.6]);

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, () => undefined);

    expect(result[0]!.commonName).toBe('Andromeda Galaxy');
  });

  it('omits commonName when absent on the entry', () => {
    const entry = makeEntry(); // no commonName
    const axisRatios = new Float32Array([0.6]);

    const result = assembleFamousGalaxiesMeta([entry], axisRatios, () => undefined);

    expect(result[0]!.commonName).toBeUndefined();
  });

  it('handles multiple entries independently', () => {
    const disk = makeDisk();
    const entries = [makeEntry({ id: 'm31' }), makeEntry({ id: 'ngc-5128' })];
    const axisRatios = new Float32Array([0.6, 0.4]);
    // Only the first entry gets a recipe with a disk.
    const result = assembleFamousGalaxiesMeta(entries, axisRatios, (id) =>
      id === 'm31' ? makeRecipe(disk) : undefined,
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.calibration).toBeDefined();
    expect(result[1]!.calibration).toBeUndefined();
  });
});

// ─── readCuratedRecipe ────────────────────────────────────────────────────────

describe('readCuratedRecipe', () => {
  it('returns undefined for a missing recipe file (no throw)', () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), 'famous-build-test-'));
    // No curated dir created — file simply doesn't exist.
    const result = readCuratedRecipe(tmpRepo, 'm31');
    expect(result).toBeUndefined();
  });

  it('returns undefined and warns on a corrupt recipe', () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), 'famous-build-test-'));
    // Place a recipe.json under curatedGalaxyDir(tmpRepo, 'm31').
    const galaxyDir = resolve(tmpRepo, 'public/images/famous-curated/m31');
    mkdirSync(galaxyDir, { recursive: true });
    writeFileSync(join(galaxyDir, 'recipe.json'), 'NOT VALID JSON {{{{');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = readCuratedRecipe(tmpRepo, 'm31');
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
