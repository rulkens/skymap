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

  it('rejects non-positive distMpc', () => {
    const bad = [baseEntry({ id: 'bad', distMpc: 0 })];
    expect(() => parseStructureSeed(JSON.stringify(bad))).toThrow(/bad.*distMpc|distMpc.*bad/i);
  });

  it('validateStructureSeedEntry rejects unknown category', () => {
    const e = baseEntry({ category: 'supergroup' as StructureSeedEntry['category'] });
    expect(() => validateStructureSeedEntry(e)).toThrow(/category/);
  });

  it('accepts category group and round-trips it', () => {
    const e = baseEntry({ id: 'local-group', category: 'group' });
    const result = validateStructureSeedEntry(e);
    expect(result.category).toBe('group');
    expect(result.id).toBe('local-group');

    // Also verify parseStructureSeed round-trips a group entry end-to-end.
    const entries = parseStructureSeed(JSON.stringify([e]));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.category).toBe('group');
  });

  it('rejects raHours below 0', () => {
    const e = baseEntry({ id: 'neg-ra', raHours: -1 });
    expect(() => validateStructureSeedEntry(e)).toThrow(/neg-ra.*raHours|raHours.*neg-ra/i);
  });

  it('rejects decDeg out of [-90, 90]', () => {
    const e = baseEntry({ id: 'bad-dec', decDeg: 91 });
    expect(() => validateStructureSeedEntry(e)).toThrow(/bad-dec.*decDeg|decDeg.*bad-dec/i);
  });

  it('rejects non-positive physicalRadiusMpc', () => {
    const e = baseEntry({ id: 'bad-phys', physicalRadiusMpc: -1 });
    expect(() => validateStructureSeedEntry(e)).toThrow(/bad-phys.*physicalRadiusMpc|physicalRadiusMpc.*bad-phys/i);
  });

  it('rejects non-positive apparentRadiusMpc', () => {
    const e = baseEntry({ id: 'bad-app', apparentRadiusMpc: 0 });
    expect(() => validateStructureSeedEntry(e)).toThrow(/bad-app.*apparentRadiusMpc|apparentRadiusMpc.*bad-app/i);
  });

  it('rejects empty id', () => {
    const e = baseEntry({ id: '' });
    expect(() => validateStructureSeedEntry(e)).toThrow(/id/);
  });

  it('rejects empty names array', () => {
    const e = baseEntry({ names: [] });
    expect(() => validateStructureSeedEntry(e)).toThrow(/coma.*names|names.*coma/i);
  });

  it('accepts optional abell field', () => {
    const e = baseEntry({ abell: 'A1656' });
    expect(validateStructureSeedEntry(e).abell).toBe('A1656');
  });

  it('accepts optional commonName field', () => {
    const e = baseEntry({ commonName: 'The Coma Cluster' });
    expect(validateStructureSeedEntry(e).commonName).toBe('The Coma Cluster');
  });

  it('rejects root that is not an array', () => {
    expect(() => parseStructureSeed('{}')).toThrow(/array/i);
  });

  it('rejects an empty description', () => {
    const e = baseEntry({ id: 'bad-desc', description: '   ' });
    expect(() => validateStructureSeedEntry(e)).toThrow(/bad-desc.*description|description.*bad-desc/i);
  });

  it('rejects a non-string abell', () => {
    const e = baseEntry({ id: 'bad-abell', abell: 99 as unknown as string });
    expect(() => validateStructureSeedEntry(e)).toThrow(/bad-abell.*abell|abell.*bad-abell/i);
  });

  it('rejects a non-string commonName', () => {
    const e = baseEntry({ id: 'bad-cn', commonName: null as unknown as string });
    expect(() => validateStructureSeedEntry(e)).toThrow(/bad-cn.*commonName|commonName.*bad-cn/i);
  });

  it('rejects an empty commonName', () => {
    const e = baseEntry({ id: 'bad-cn2', commonName: '' });
    expect(() => validateStructureSeedEntry(e)).toThrow(/bad-cn2.*commonName|commonName.*bad-cn2/i);
  });
});
