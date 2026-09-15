import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseStructureSeed,
  validateStructureSeedEntry,
  type StructureSeedEntry,
} from '../../../tools/parsers/parseStructureSeed';
import { rawDataPath } from '../../../tools/utils/io/rawDataRegistry';

function baseEntry(overrides: Partial<StructureSeedEntry> = {}): StructureSeedEntry {
  return {
    id: 'coma',
    names: ['Coma Cluster', 'A1656'],
    category: 'cluster',
    raHours: 12.997,
    decDeg: 27.98,
    distMpc: 100,
    physicalRadiusMpc: 3.0,
    apparentRadiusMpc: 6.0,
    description: 'Test cluster fixture.',
    ...overrides,
  };
}

describe('parseStructureSeed', () => {
  it('accepts the bundled seed file', () => {
    const raw = readFileSync(rawDataPath('structures.seed'), 'utf8');
    const entries = parseStructureSeed(raw);
    expect(entries.length).toBeGreaterThanOrEqual(25);
    const validCategories = new Set(['cluster', 'supercluster', 'void', 'group']);
    for (const e of entries) {
      expect(validCategories.has(e.category)).toBe(true);
    }
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
