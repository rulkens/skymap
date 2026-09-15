import { describe, expect, it } from 'vitest';
import {
  parseFamousSeed,
  validateFamousEntry,
  type FamousEntry,
} from '../../../tools/parsers/famousSeed';

function baseEntry(overrides: Partial<FamousEntry> = {}): FamousEntry {
  return {
    id: 'm31',
    names: ['M31', 'NGC 224'],
    ra: 10.6847,
    dec: 41.2687,
    distanceMpc: 0.78,
    diameterKpc: 67,
    type: 'SA(s)b',
    description: 'A nearby spiral galaxy.',
    ...overrides,
  };
}

describe('famousSeed', () => {
  it('rejects a commonName that is the empty string', () => {
    const e = baseEntry({ commonName: '' });
    expect(() => validateFamousEntry(e)).toThrow(/commonName/);
  });

  it('parseFamousSeed propagates commonName through the array', () => {
    const json = JSON.stringify([
      { ...baseEntry({ id: 'm31', commonName: 'Andromeda Galaxy' }) },
      { ...baseEntry({ id: 'm33' }) },
    ]);
    const out = parseFamousSeed(json);
    expect(out[0]!.commonName).toBe('Andromeda Galaxy');
    expect(out[1]!.commonName).toBeUndefined();
  });
});
