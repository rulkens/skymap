import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseFamousStarsSeed,
  validateFamousStarEntry,
  type FamousStarEntry,
} from '../../../tools/parsers/famousStarsSeed';

function baseEntry(overrides: Partial<FamousStarEntry> = {}): FamousStarEntry {
  return {
    id: 'betelgeuse',
    commonName: 'Betelgeuse',
    names: ['Betelgeuse', 'Alpha Orionis'],
    constellation: 'Orion',
    ra: 88.7929,
    dec: 7.4071,
    distancePc: 168,
    magV: 0.42,
    absMag: -5.85,
    spectralType: 'M1-2 Ia-ab',
    radiusSolar: 764,
    temperatureK: 3600,
    gaiaDr3: '3319948333282076928',
    description: 'A red supergiant in Orion, one of the brightest stars in the sky.',
    ...overrides,
  };
}

describe('famousStarsSeed', () => {
  it('throws on a duplicate id', () => {
    const json = JSON.stringify([baseEntry({ id: 'vega' }), baseEntry({ id: 'vega' })]);
    expect(() => parseFamousStarsSeed(json)).toThrow(/duplicate id/);
  });

  it('throws on a missing gaiaDr3 field', () => {
    // Hand-build the object with no gaiaDr3 key at all — the required-field
    // invariant: "not yet resolved" must never read as "nothing to subtract".
    const e = baseEntry();
    delete (e as { gaiaDr3?: string | null }).gaiaDr3;
    expect(() => validateFamousStarEntry(e)).toThrow(/gaiaDr3/);
  });

  it('accepts gaiaDr3: null', () => {
    const e = baseEntry({ id: 'sun', gaiaDr3: null });
    expect(validateFamousStarEntry(e).gaiaDr3).toBeNull();
  });

  it('throws on a non-digit gaiaDr3 string', () => {
    expect(() => validateFamousStarEntry(baseEntry({ gaiaDr3: 'DR3 123' }))).toThrow(/gaiaDr3/);
    expect(() => validateFamousStarEntry(baseEntry({ gaiaDr3: '12a3' }))).toThrow(/gaiaDr3/);
  });

  it('throws on out-of-range ra / dec / distancePc / temperatureK', () => {
    expect(() => validateFamousStarEntry(baseEntry({ ra: 360 }))).toThrow(/ra/);
    expect(() => validateFamousStarEntry(baseEntry({ dec: 91 }))).toThrow(/dec/);
    expect(() => validateFamousStarEntry(baseEntry({ distancePc: -1 }))).toThrow(/distance/);
    expect(() => validateFamousStarEntry(baseEntry({ temperatureK: 999 }))).toThrow(/temperature/);
  });

  it('accepts distancePc: 0 — the Sun', () => {
    expect(validateFamousStarEntry(baseEntry({ id: 'sun', distancePc: 0 })).distancePc).toBe(0);
  });

  it('throws when names[0] !== commonName', () => {
    const e = baseEntry({ commonName: 'Betelgeuse', names: ['Alpha Orionis', 'Betelgeuse'] });
    expect(() => validateFamousStarEntry(e)).toThrow(/names/);
  });

  it('accepts an entry with no names[1]', () => {
    // Correction-3 regression guard: nearest stars (Barnard's Star, Wolf 359)
    // have no Bayer designation, so a single-name entry is valid.
    const e = baseEntry({
      id: 'barnards-star',
      commonName: "Barnard's Star",
      names: ["Barnard's Star"],
    });
    expect(validateFamousStarEntry(e).names).toHaveLength(1);
  });

  it('accepts an entry omitting massSolar/luminositySolar/ageGyr', () => {
    const e = baseEntry();
    expect(e.massSolar).toBeUndefined();
    expect(validateFamousStarEntry(e).id).toBe('betelgeuse');
  });

  it('parseFamousStarsSeed carries entries through the array', () => {
    const json = JSON.stringify([baseEntry({ id: 'sirius' }), baseEntry({ id: 'vega' })]);
    const out = parseFamousStarsSeed(json);
    expect(out.map((e) => e.id)).toEqual(['sirius', 'vega']);
  });
});

// Coverage invariant migrated from the deleted famousStarGaiaIds.test.ts: every
// curated entry carries a resolved gaiaDr3, and the Sun's is null. This reads the
// REAL committed seed, which Task 5 authors — until it exists the block skips.
//
// The seed path is resolved as the literal committed path relative to the repo
// root (tests may use literal fixture paths; the rawDataPath registry rule binds
// src/tools code, not test fixture resolution). Task 4 adds the
// 'famous-stars.seed' registry key that supersedes this literal in tool code.
const SEED_PATH = fileURLToPath(
  new URL('../../../data/seeds/famous_stars.seed.json', import.meta.url),
);

describe.skipIf(!existsSync(SEED_PATH))('famousStarsSeed — real committed seed', () => {
  it('every parsed entry carries gaiaDr3, and the Sun is null', () => {
    const entries = parseFamousStarsSeed(readFileSync(SEED_PATH, 'utf8'));
    for (const e of entries) {
      expect(Object.prototype.hasOwnProperty.call(e, 'gaiaDr3')).toBe(true);
    }
    const sun = entries.find((e) => e.id === 'sun');
    expect(sun).toBeDefined();
    expect(sun!.gaiaDr3).toBeNull();
  });
});
