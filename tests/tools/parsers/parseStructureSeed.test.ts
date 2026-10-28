import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseStructureSeed,
  validateStructureSeedEntry,
  type StructureSeedEntry,
} from '../../../tools/parsers/parseStructureSeed';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { rawDataPath } from '../../../tools/utils/io/rawDataRegistry';

function baseEntry(overrides: Partial<StructureSeedEntry> = {}): StructureSeedEntry {
  return {
    id: 'coma',
    names: ['Coma Cluster', 'A1656'],
    category: 'galaxy-cluster',
    raHours: 12.997,
    decDeg: 27.98,
    distance: { value: 100, unit: 'Mpc' },
    physicalRadius: { value: 3.0, unit: 'Mpc' },
    apparentRadius: { value: 6.0, unit: 'Mpc' },
    description: 'Test cluster fixture.',
    ...overrides,
  };
}

describe('parseStructureSeed', () => {
  it('accepts the bundled seed file', () => {
    const raw = readFileSync(rawDataPath('structures.seed'), 'utf8');
    const entries = parseStructureSeed(raw);
    expect(entries.length).toBeGreaterThanOrEqual(25);
    const validCategories = new Set(STRUCTURE_IDS as readonly string[]);
    for (const e of entries) {
      expect(validCategories.has(e.category)).toBe(true);
    }
  });

  it('rejects an unknown length unit', () => {
    const bad = [
      baseEntry({
        id: 'bad',
        distance: { value: 1, unit: 'ly' as unknown as 'Mpc' },
      }),
    ];
    expect(() => parseStructureSeed(JSON.stringify(bad))).toThrow(/bad.*unit|unit.*bad/i);
  });

  it('rejects out-of-range raHours', () => {
    const bad = [baseEntry({ id: 'bad', raHours: 24 })];
    expect(() => parseStructureSeed(JSON.stringify(bad))).toThrow(/bad.*raHours|raHours.*bad/i);
  });

  it('rejects duplicate ids', () => {
    const dups = [baseEntry({ id: 'coma' }), baseEntry({ id: 'coma' })];
    expect(() => parseStructureSeed(JSON.stringify(dups))).toThrow(/duplicate id/i);
  });

  it('validateStructureSeedEntry rejects unknown category', () => {
    const e = baseEntry({ category: 'supergroup' as StructureSeedEntry['category'] });
    expect(() => validateStructureSeedEntry(e)).toThrow(/category/);
  });

  it('rejects root that is not an array', () => {
    expect(() => parseStructureSeed('{}')).toThrow(/array/i);
  });
});

describe('Milky Way seed fields', () => {
  const milkyWay = (overrides: Partial<StructureSeedEntry>) =>
    baseEntry({ category: 'open-cluster', source: 'Hunt & Reffert 2024', ...overrides });

  it('rejects nebulaKind on a non-nebula', () => {
    const e = milkyWay({ nebulaKind: 'emission' });
    expect(() => validateStructureSeedEntry(e)).toThrow(/nebulaKind/);
  });

  it('rejects an unknown nebulaKind', () => {
    const e = milkyWay({
      category: 'nebula',
      nebulaKind: 'cloud' as StructureSeedEntry['nebulaKind'],
    });
    expect(() => validateStructureSeedEntry(e)).toThrow(/nebulaKind/);
  });

  it('rejects an empty wikipedia title', () => {
    expect(() => validateStructureSeedEntry(baseEntry({ wikipedia: '' }))).toThrow(/wikipedia/);
  });

  it('rejects a Milky Way row without source', () => {
    const e = milkyWay({ source: undefined });
    expect(() => validateStructureSeedEntry(e)).toThrow(/source/);
  });

  it('requires planets and discovered on an exoplanet system, and rejects them elsewhere', () => {
    const exo = (o: Partial<StructureSeedEntry>) =>
      milkyWay({ category: 'exoplanet-system', planets: 7, discovered: 2016, ...o });
    expect(() => validateStructureSeedEntry(exo({}))).not.toThrow();
    expect(() => validateStructureSeedEntry(exo({ planets: 0 }))).toThrow(/planets/);
    expect(() => validateStructureSeedEntry(exo({ discovered: undefined }))).toThrow(/discovered/);
    expect(() => validateStructureSeedEntry(milkyWay({ planets: 2 }))).toThrow(/exoplanet-system/);
  });

  it('requires known messengers on a transient, checks its date, and rejects both elsewhere', () => {
    const transient = (o: Partial<StructureSeedEntry>) =>
      baseEntry({ category: 'transient', messengers: ['radio'], ...o });
    expect(() => validateStructureSeedEntry(transient({ date: '2017-08-17' }))).not.toThrow();
    expect(() => validateStructureSeedEntry(transient({}))).not.toThrow();
    expect(() => validateStructureSeedEntry(transient({ messengers: [] }))).toThrow(/messengers/);
    expect(() =>
      validateStructureSeedEntry(
        transient({ messengers: ['x-rays'] as unknown as StructureSeedEntry['messengers'] }),
      ),
    ).toThrow(/messengers/);
    expect(() => validateStructureSeedEntry(transient({ date: '17 Aug 2017' }))).toThrow(/date/);
    expect(() => validateStructureSeedEntry(baseEntry({ date: '2017-08-17' }))).toThrow(
      /transient/,
    );
  });

  it('accepts a complete nebula and a gc-cluster row', () => {
    expect(() =>
      validateStructureSeedEntry(milkyWay({ category: 'nebula', nebulaKind: 'dark' })),
    ).not.toThrow();
    expect(() => validateStructureSeedEntry(milkyWay({ category: 'gc-cluster' }))).not.toThrow();
  });
});
