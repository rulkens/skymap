import { describe, expect, it } from 'vitest';

import { hashedDataName } from '../../../../tools/utils/data/hashedDataName';
import { logicalDataName } from '../../../../tools/utils/data/logicalDataName';

describe('logicalDataName / hashedDataName', () => {
  it('logicalDataName inverts hashedDataName across the tracked extensions', () => {
    const hash = 'a3f19c2e';
    for (const logical of [
      'sdss-large.bin',
      'flowfield.scfd',
      'structures.ccat',
      'constellations.json',
    ]) {
      const hashed = hashedDataName(logical, hash);
      expect(logicalDataName(hashed)).toBe(logical);
    }
  });

  it('logicalDataName leaves an un-hashed name alone', () => {
    // Stems that already contain dots or hex-looking runs must not be
    // mistaken for a hash infix — the infix is only ever stripped when it
    // is exactly 8 hex chars immediately before the extension.
    expect(logicalDataName('mcpm-small.scfd')).toBe('mcpm-small.scfd');
    expect(logicalDataName('desi-deep.bin')).toBe('desi-deep.bin');
    expect(logicalDataName('constellations.json')).toBe('constellations.json');
  });
});
