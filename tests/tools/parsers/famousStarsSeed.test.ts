import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseFamousStarsSeed,
  selectHipEntries,
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
    hip: 27989,
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

  it('throws on a missing hip field', () => {
    // Same required-field invariant as gaiaDr3: a curation gap ("not yet
    // resolved") must never be indistinguishable from an intended null.
    const e = baseEntry();
    delete (e as { hip?: number | null }).hip;
    expect(() => validateFamousStarEntry(e)).toThrow(/hip/);
  });

  it('throws when hip disagrees with a HIP alias', () => {
    const e = baseEntry({ names: ['Betelgeuse', 'HIP 100'], hip: 200 });
    expect(() => validateFamousStarEntry(e)).toThrow(/hip/);
    expect(
      validateFamousStarEntry(baseEntry({ names: ['Betelgeuse', 'HIP 100'], hip: 100 })).hip,
    ).toBe(100);
  });

  it('throws when hipCompanions is present but hip is null', () => {
    // A companion is an *additional* resolved component; the canonical hip is the
    // identity, so companions are meaningless without it.
    const e = baseEntry({ id: 'sun', gaiaDr3: null, hip: null, hipCompanions: [71681] });
    expect(() => validateFamousStarEntry(e)).toThrow(/hipCompanions/);
  });

  it('throws when hipCompanions contains the entry own hip', () => {
    // The canonical hip stays the identity; a companion repeating it would
    // double-count the same Hipparcos row in the dedup set.
    expect(() =>
      validateFamousStarEntry(baseEntry({ hip: 71683, hipCompanions: [71683] })),
    ).toThrow(/hipCompanions/);
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

  it("accepts the Sun's magV -26.74", () => {
    const e = baseEntry({ id: 'sun', magV: -26.74, absMag: 4.83, gaiaDr3: null });
    expect(validateFamousStarEntry(e).magV).toBe(-26.74);
  });

  it('selectHipEntries drops null-hip entries and narrows the type', () => {
    const entries = [
      baseEntry({ id: 'sirius', hip: 100 }),
      baseEntry({ id: 'sun', gaiaDr3: null, hip: null }),
    ];
    const kept = selectHipEntries(entries);
    expect(kept.map((e) => e.id)).toEqual(['sirius']);
    // The narrowed element reads `hip` as a plain number, no non-null assertion.
    expect(kept[0]!.hip + 1).toBe(101);
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

  it('every entry carries hip, the Sun is null, and hip matches any HIP alias', () => {
    const entries = parseFamousStarsSeed(readFileSync(SEED_PATH, 'utf8'));
    for (const e of entries) {
      expect(Object.prototype.hasOwnProperty.call(e, 'hip')).toBe(true);
    }
    const sun = entries.find((e) => e.id === 'sun');
    expect(sun!.hip).toBeNull();
    // Every entry whose names[] carries a "HIP n" alias must have hip === n —
    // catches drift between the two hand-authored fields across the real seed.
    for (const e of entries) {
      const alias = e.names.find((n) => /^HIP \d+$/.test(n));
      if (alias) {
        expect(e.hip).toBe(Number(alias.slice(4)));
      }
    }
  });
});
