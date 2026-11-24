import { describe, expect, it } from 'vitest';
import {
  parsePlanetFactsSeed,
  type PlanetFactsEntry,
} from '../../../tools/parsers/planetFactsSeed';

function baseEntry(overrides: Partial<PlanetFactsEntry> = {}): PlanetFactsEntry {
  return {
    id: 'mercury',
    massKg: 3.301e23,
    wikiTitle: 'Mercury_(planet)',
    ...overrides,
  };
}

describe('planetFactsSeed', () => {
  it('throws on a duplicate id', () => {
    const seed = [baseEntry({ id: 'mars' }), baseEntry({ id: 'mars' })];
    expect(() => parsePlanetFactsSeed(seed)).toThrow(/duplicate id/);
  });

  it('rejects a mass that is not a positive number', () => {
    const seed = [{ ...baseEntry(), massKg: '0.055 M⊕' }];
    expect(() => parsePlanetFactsSeed(seed)).toThrow(/massKg must be a positive number/);
  });

  it('accepts a minimal valid array and returns ids intact', () => {
    const out = parsePlanetFactsSeed([baseEntry({ id: 'earth' }), baseEntry({ id: 'moon' })]);
    expect(out.map((e) => e.id)).toEqual(['earth', 'moon']);
  });
});
