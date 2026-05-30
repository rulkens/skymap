import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseClusterSeed,
  validateClusterSeedEntry,
  type ClusterSeedEntry,
} from '../../../tools/parsers/parseClusterSeed';
import { rawDataPath } from '../../../tools/utils/io/rawDataRegistry';

function baseEntry(overrides: Partial<ClusterSeedEntry> = {}): ClusterSeedEntry {
  return {
    id: 'coma',
    names: ['Coma Cluster', 'A1656'],
    category: 'cluster',
    raHours: 12.997,
    decDeg: 27.98,
    distMpc: 100,
    physicalRadiusMpc: 3.0,
    apparentRadiusMpc: 6.0,
    description: 'Nearest rich galaxy cluster.',
    ...overrides,
  };
}

describe('parseClusterSeed', () => {
  it('accepts the bundled seed file', () => {
    const raw = readFileSync(rawDataPath('clusters.seed'), 'utf8');
    const entries = parseClusterSeed(raw);
    expect(entries.length).toBeGreaterThanOrEqual(25);
    const validCategories = new Set(['cluster', 'supercluster', 'void']);
    for (const e of entries) {
      expect(validCategories.has(e.category)).toBe(true);
    }
  });

  it('rejects out-of-range raHours', () => {
    const bad = [baseEntry({ id: 'bad', raHours: 24 })];
    expect(() => parseClusterSeed(JSON.stringify(bad))).toThrow(/bad.*raHours|raHours.*bad/i);
  });

  it('rejects duplicate ids', () => {
    const dups = [baseEntry({ id: 'coma' }), baseEntry({ id: 'coma' })];
    expect(() => parseClusterSeed(JSON.stringify(dups))).toThrow(/duplicate id/i);
  });

  it('rejects non-positive distMpc', () => {
    const bad = [baseEntry({ id: 'bad', distMpc: 0 })];
    expect(() => parseClusterSeed(JSON.stringify(bad))).toThrow(/bad.*distMpc|distMpc.*bad/i);
  });

  it('validateClusterSeedEntry rejects unknown category', () => {
    const e = baseEntry({ category: 'supergroup' as ClusterSeedEntry['category'] });
    expect(() => validateClusterSeedEntry(e)).toThrow(/category/);
  });

  it('rejects raHours below 0', () => {
    const e = baseEntry({ id: 'neg-ra', raHours: -1 });
    expect(() => validateClusterSeedEntry(e)).toThrow(/neg-ra.*raHours|raHours.*neg-ra/i);
  });

  it('rejects decDeg out of [-90, 90]', () => {
    const e = baseEntry({ id: 'bad-dec', decDeg: 91 });
    expect(() => validateClusterSeedEntry(e)).toThrow(/bad-dec.*decDeg|decDeg.*bad-dec/i);
  });

  it('rejects non-positive physicalRadiusMpc', () => {
    const e = baseEntry({ id: 'bad-phys', physicalRadiusMpc: -1 });
    expect(() => validateClusterSeedEntry(e)).toThrow(/bad-phys.*physicalRadiusMpc|physicalRadiusMpc.*bad-phys/i);
  });

  it('rejects non-positive apparentRadiusMpc', () => {
    const e = baseEntry({ id: 'bad-app', apparentRadiusMpc: 0 });
    expect(() => validateClusterSeedEntry(e)).toThrow(/bad-app.*apparentRadiusMpc|apparentRadiusMpc.*bad-app/i);
  });

  it('rejects empty id', () => {
    const e = baseEntry({ id: '' });
    expect(() => validateClusterSeedEntry(e)).toThrow(/id/);
  });

  it('rejects empty names array', () => {
    const e = baseEntry({ names: [] });
    expect(() => validateClusterSeedEntry(e)).toThrow(/coma.*names|names.*coma/i);
  });

  it('accepts optional abell field', () => {
    const e = baseEntry({ abell: 'A1656' });
    expect(validateClusterSeedEntry(e).abell).toBe('A1656');
  });

  it('accepts optional commonName field', () => {
    const e = baseEntry({ commonName: 'The Coma Cluster' });
    expect(validateClusterSeedEntry(e).commonName).toBe('The Coma Cluster');
  });

  it('rejects root that is not an array', () => {
    expect(() => parseClusterSeed('{}')).toThrow(/array/i);
  });
});
