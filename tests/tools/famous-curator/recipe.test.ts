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
  type Recipe,
} from '../../../tools/famous-curator/plugin/recipe';

function sample(): Recipe {
  return {
    version: 1,
    id: 'm31',
    crop: { x: 100, y: 200, width: 1820, height: 1820 },
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
});
