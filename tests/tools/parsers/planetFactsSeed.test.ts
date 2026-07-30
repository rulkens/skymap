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
  it('throws when the root is not an array', () => {
    expect(() => parsePlanetFactsSeed({ id: 'mercury' })).toThrow(/must be an array/);
  });

  it('throws on a duplicate id', () => {
    const seed = [baseEntry({ id: 'mars' }), baseEntry({ id: 'mars' })];
    expect(() => parsePlanetFactsSeed(seed)).toThrow(/duplicate id/);
  });

  it('throws when an entry is missing id', () => {
    const e = baseEntry();
    delete (e as { id?: string }).id;
    expect(() => parsePlanetFactsSeed([e])).toThrow(/id/);
  });

  it('throws when an entry is missing wikiTitle', () => {
    const e = baseEntry();
    delete (e as { wikiTitle?: string }).wikiTitle;
    expect(() => parsePlanetFactsSeed([e])).toThrow(/wikiTitle/);
  });

  it('throws when a present field is not a string', () => {
    expect(() => parsePlanetFactsSeed([baseEntry({ moons: 2 as never })])).toThrow(/moons/);
  });

  it('accepts a minimal valid array and returns ids intact', () => {
    const out = parsePlanetFactsSeed([baseEntry({ id: 'earth' }), baseEntry({ id: 'moon' })]);
    expect(out.map((e) => e.id)).toEqual(['earth', 'moon']);
  });
});
