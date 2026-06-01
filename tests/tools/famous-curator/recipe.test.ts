/**
 * recipe — pure serialiser tests.
 *
 * The recipe is the per-galaxy file at
 * public/images/famous-curated/<id>/recipe.json.  It must round-trip
 * losslessly (parse → serialise → parse → deep-equal) and reject
 * malformed inputs at parse time.
 */
import { describe, expect, it } from 'vitest';
import {
  serialiseRecipe,
  parseRecipe,
  validateRecipeDisk,
  type Recipe,
  type RecipeDisk,
} from '../../../tools/famous-curator/plugin/recipe';

function sample(): Recipe {
  return {
    version: 1,
    id: 'm31',
    crop: { x: 100, y: 200, width: 1820, height: 1820, rotationDeg: 0 },
    starnet: { stride: 256, upsample: false },
    alpha: { blackPoint: 8, whitePoint: 230, gamma: 0.7 },
    metadata: {
      sourceUrl: 'https://www.astrobin.com/abc',
      license: 'CC-BY-SA-4.0',
      author: 'Niall MacNeill',
    },
    processedAt: '2026-05-18T14:32:01Z',
  };
}

describe('recipe', () => {
  it('round-trips losslessly', () => {
    const r = sample();
    const json = serialiseRecipe(r);
    expect(parseRecipe(json)).toEqual(r);
  });

  it('emits stable two-space-indented JSON for diff-friendly commits', () => {
    const r = sample();
    const json = serialiseRecipe(r);
    expect(json.startsWith('{\n  "version": 1,')).toBe(true);
    expect(json.endsWith('}\n')).toBe(true);
  });

  it('rejects an object missing the crop block', () => {
    const r = sample() as unknown as Record<string, unknown>;
    delete r.crop;
    expect(() => parseRecipe(JSON.stringify(r))).toThrow(/crop/);
  });

  it('rejects an invalid alpha.gamma (non-finite)', () => {
    const r = sample();
    r.alpha.gamma = Number.NaN;
    expect(() => parseRecipe(JSON.stringify(r))).toThrow(/gamma/);
  });

  it('rejects a future version it does not know how to parse', () => {
    const r = sample();
    (r as unknown as { version: number }).version = 99;
    expect(() => parseRecipe(JSON.stringify(r))).toThrow(/version/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseRecipe('not json {')).toThrow();
  });

  // --- RecipeDisk ---
  // The disk block is optional: recipes without it must round-trip unchanged;
  // recipes with it must round-trip every field, validate types, and return
  // a freshly-constructed value with no aliasing to the caller's input.

  it('parseRecipe round-trips a recipe with no disk block (disk stays undefined)', () => {
    const r = sample();
    // Confirm sample() has no disk field, then check the parsed result too.
    expect(r.disk).toBeUndefined();
    expect(parseRecipe(serialiseRecipe(r)).disk).toBeUndefined();
  });

  it('parseRecipe parses a valid disk block', () => {
    const r = sample();
    const disk: RecipeDisk = {
      centerPx: [120, 80],
      radiusPx: 64,
      paDeg: 30,
      deproject: true,
    };
    r.disk = disk;
    const parsed = parseRecipe(serialiseRecipe(r));
    expect(parsed.disk).toBeDefined();
    expect(parsed.disk!.centerPx).toEqual([120, 80]);
    expect(parsed.disk!.radiusPx).toBe(64);
    expect(parsed.disk!.paDeg).toBe(30);
    expect(parsed.disk!.deproject).toBe(true);
    // centerPx must be a fresh tuple — no aliasing to the original input.
    expect(parsed.disk!.centerPx).not.toBe(disk.centerPx);
  });

  it('parseRecipe parses disk.axisRatio when present and leaves it undefined when absent', () => {
    const r = sample();
    // Absent: axisRatio not set.
    r.disk = { centerPx: [100, 100], radiusPx: 50, paDeg: 0, deproject: false };
    const withoutRatio = parseRecipe(serialiseRecipe(r));
    expect(withoutRatio.disk!.axisRatio).toBeUndefined();

    // Present: axisRatio set to 0.6.
    r.disk = { centerPx: [100, 100], radiusPx: 50, paDeg: 0, deproject: false, axisRatio: 0.6 };
    const withRatio = parseRecipe(serialiseRecipe(r));
    expect(withRatio.disk!.axisRatio).toBe(0.6);
  });

  it('parseRecipe throws when disk.centerPx is not a 2-number tuple', () => {
    const r = sample();
    // Length-1 array.
    r.disk = {
      centerPx: [1] as unknown as [number, number],
      radiusPx: 50,
      paDeg: 0,
      deproject: false,
    };
    expect(() => parseRecipe(serialiseRecipe(r))).toThrow(/centerPx/);

    // Not an array at all.
    r.disk = {
      centerPx: 5 as unknown as [number, number],
      radiusPx: 50,
      paDeg: 0,
      deproject: false,
    };
    expect(() => parseRecipe(serialiseRecipe(r))).toThrow(/centerPx/);
  });

  it('parseRecipe throws when disk.radiusPx or disk.paDeg is non-finite', () => {
    const r = sample();
    r.disk = { centerPx: [100, 100], radiusPx: Infinity, paDeg: 0, deproject: false };
    expect(() => parseRecipe(serialiseRecipe(r))).toThrow(/radiusPx/);

    r.disk = { centerPx: [100, 100], radiusPx: 50, paDeg: NaN, deproject: false };
    expect(() => parseRecipe(serialiseRecipe(r))).toThrow(/paDeg/);
  });

  it('parseRecipe throws when disk.deproject is not a boolean', () => {
    const r = sample();
    r.disk = { centerPx: [100, 100], radiusPx: 50, paDeg: 0, deproject: 1 as unknown as boolean };
    expect(() => parseRecipe(serialiseRecipe(r))).toThrow(/deproject/);
  });
});

describe('RecipeDisk.margin', () => {
  it('round-trips a margin through serialise/parse', () => {
    const r = parseRecipe(
      serialiseRecipe({
        version: 1,
        id: 'm51',
        crop: { x: 0, y: 0, width: 10, height: 10, rotationDeg: 0 },
        starnet: { stride: 16, upsample: false },
        alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
        metadata: { sourceUrl: 'u', license: 'l', author: 'a' },
        processedAt: '2026-06-01T00:00:00Z',
        disk: { centerPx: [1, 2], radiusPx: 3, paDeg: 4, deproject: true, margin: 0.5 },
      }),
    );
    expect(r.disk?.margin).toBe(0.5);
  });

  it('omits margin when absent (backward compatible)', () => {
    const d = validateRecipeDisk({ centerPx: [1, 2], radiusPx: 3, paDeg: 4, deproject: false });
    expect('margin' in d).toBe(false);
  });

  it('throws on a negative margin', () => {
    expect(() =>
      validateRecipeDisk({
        centerPx: [1, 2],
        radiusPx: 3,
        paDeg: 4,
        deproject: true,
        margin: -0.1,
      }),
    ).toThrow(/margin/);
  });
});
