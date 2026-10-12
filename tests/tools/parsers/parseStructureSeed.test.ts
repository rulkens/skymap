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

  it('accepts a complete nebula and a gc-cluster row', () => {
    expect(() =>
      validateStructureSeedEntry(milkyWay({ category: 'nebula', nebulaKind: 'dark' })),
    ).not.toThrow();
    expect(() =>
      validateStructureSeedEntry(milkyWay({ category: 'gc-cluster' })),
    ).not.toThrow();
  });
});
