import { describe, expect, it } from 'vitest';
import { wikipediaUrl } from '../../../src/utils/format/wikipediaUrl';

describe('wikipediaUrl', () => {
  it('swaps spaces for underscores and keeps a disambiguator readable', () => {
    // encodeURIComponent leaves parentheses alone, so the "(planet)" /
    // "(star)" disambiguators stay legible in the final URL.
    expect(wikipediaUrl('Mercury_(planet)')).toBe('https://en.wikipedia.org/wiki/Mercury_(planet)');
    expect(wikipediaUrl('Alpha Pavonis')).toBe('https://en.wikipedia.org/wiki/Alpha_Pavonis');
  });
});
