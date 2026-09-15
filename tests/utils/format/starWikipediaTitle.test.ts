import { describe, expect, it } from 'vitest';
import { starWikipediaTitle } from '../../../src/utils/format/starWikipediaTitle';

describe('starWikipediaTitle', () => {
  it('overrides names whose plain slug lands on a disambiguation or wrong topic', () => {
    // These would 404 or link the myth/plant/place instead of the star.
    expect(starWikipediaTitle('Pollux')).toBe('Pollux (star)');
    expect(starWikipediaTitle('Castor')).toBe('Castor (star)');
    expect(starWikipediaTitle('Peacock')).toBe('Alpha Pavonis');
    expect(starWikipediaTitle('Mimosa')).toBe('Mimosa (star)');
    expect(starWikipediaTitle('Sadr')).toBe('Sadr (star)');
    expect(starWikipediaTitle('Naos')).toBe('Zeta Puppis');
  });
});
