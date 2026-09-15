import { describe, expect, it } from 'vitest';
import {
  parsePlanetFactsSeed,
  type PlanetFactsEntry,
} from '../../../tools/parsers/planetFactsSeed';

function baseEntry(overrides: Partial<PlanetFactsEntry> = {}): PlanetFactsEntry {
  return {
    id: 'mercury',
    mass: '0.055 M⊕',
    wikiTitle: 'Mercury_(planet)',
    ...overrides,
  };
}

describe('planetFactsSeed', () => {
  it('throws on a duplicate id', () => {
    const seed = [baseEntry({ id: 'mars' }), baseEntry({ id: 'mars' })];
    expect(() => parsePlanetFactsSeed(seed)).toThrow(/duplicate id/);
  });

  it('accepts a minimal valid array and returns ids intact', () => {
    const out = parsePlanetFactsSeed([baseEntry({ id: 'earth' }), baseEntry({ id: 'moon' })]);
    expect(out.map((e) => e.id)).toEqual(['earth', 'moon']);
  });
});
