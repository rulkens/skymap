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

  it('throws on a non-digit gaiaDr3 string', () => {
    expect(() => validateFamousStarEntry(baseEntry({ gaiaDr3: 'DR3 123' }))).toThrow(/gaiaDr3/);
    expect(() => validateFamousStarEntry(baseEntry({ gaiaDr3: '12a3' }))).toThrow(/gaiaDr3/);
  });

  it('throws on a missing hip field', () => {
    // Same required-field invariant as gaiaDr3: a curation gap ("not yet
    // resolved") must never be indistinguishable from an intended null.
    const e = baseEntry();
    delete (e as { hip?: number | null }).hip;
    expect(() => validateFamousStarEntry(e)).toThrow(/hip/);
  });

  it('accepts hip: null — the Sun', () => {
    const e = baseEntry({ id: 'sun', gaiaDr3: null, hip: null });
    expect(validateFamousStarEntry(e).hip).toBeNull();
  });

  it('throws on a non-integer or non-positive hip', () => {
    expect(() => validateFamousStarEntry(baseEntry({ hip: 1.5 }))).toThrow(/hip/);
    expect(() => validateFamousStarEntry(baseEntry({ hip: -1 }))).toThrow(/hip/);
    expect(() => validateFamousStarEntry(baseEntry({ hip: 0 }))).toThrow(/hip/);
  });

  it('throws when hip disagrees with a HIP alias', () => {
    const e = baseEntry({ names: ['Betelgeuse', 'HIP 100'], hip: 200 });
    expect(() => validateFamousStarEntry(e)).toThrow(/hip/);
    expect(
      validateFamousStarEntry(baseEntry({ names: ['Betelgeuse', 'HIP 100'], hip: 100 })).hip,
    ).toBe(100);
  });

  it('allows a non-null hip with no HIP alias — the Alpha Centauri enrichment', () => {
    const e = baseEntry({ names: ['Betelgeuse'], hip: 71683 });
    expect(validateFamousStarEntry(e).hip).toBe(71683);
  });

  it('accepts hipCompanions — the Alpha Centauri two-component case', () => {
    const e = baseEntry({ names: ['Betelgeuse'], hip: 71683, hipCompanions: [71681] });
    expect(validateFamousStarEntry(e).hipCompanions).toEqual([71681]);
  });

  it('throws when hipCompanions is present but hip is null', () => {
    // A companion is an *additional* resolved component; the canonical hip is the
    // identity, so companions are meaningless without it.
    const e = baseEntry({ id: 'sun', gaiaDr3: null, hip: null, hipCompanions: [71681] });
    expect(() => validateFamousStarEntry(e)).toThrow(/hipCompanions/);
  });

  it('throws on a non-positive or non-integer hipCompanion', () => {
    expect(() => validateFamousStarEntry(baseEntry({ hipCompanions: [1.5] }))).toThrow(
      /hipCompanions/,
    );
    expect(() => validateFamousStarEntry(baseEntry({ hipCompanions: [-1] }))).toThrow(
      /hipCompanions/,
    );
    expect(() => validateFamousStarEntry(baseEntry({ hipCompanions: [0] }))).toThrow(
      /hipCompanions/,
    );
  });

  it('throws on a duplicate hipCompanion', () => {
    expect(() =>
      validateFamousStarEntry(baseEntry({ hip: 71683, hipCompanions: [71681, 71681] })),
    ).toThrow(/hipCompanions/);
  });

  it('throws when hipCompanions contains the entry own hip', () => {
    // The canonical hip stays the identity; a companion repeating it would
    // double-count the same Hipparcos row in the dedup set.
    expect(() =>
      validateFamousStarEntry(baseEntry({ hip: 71683, hipCompanions: [71683] })),
    ).toThrow(/hipCompanions/);
  });

  it('throws on an empty hipCompanions array', () => {
    // Convention: the key is present only when non-empty; an empty array is the
    // "absent value as an empty key" placeholder the schema forbids elsewhere.
    expect(() => validateFamousStarEntry(baseEntry({ hip: 71683, hipCompanions: [] }))).toThrow(
      /hipCompanions/,
    );
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

  it('throws on a malformed variable', () => {
    // Wrong-length magRange, non-finite member, and empty type are all loud.
    expect(() =>
      validateFamousStarEntry(baseEntry({ variable: { type: 'SRC', magRange: [0.0] as never } })),
    ).toThrow(/variable/);
    expect(() =>
      validateFamousStarEntry(
        baseEntry({ variable: { type: 'SRC', magRange: [0.0, Number.NaN] } }),
      ),
    ).toThrow(/variable/);
    expect(() =>
      validateFamousStarEntry(baseEntry({ variable: { type: '', magRange: [0.0, 1.3] } })),
    ).toThrow(/variable/);
    // magRange[0] must not exceed magRange[1].
    expect(() =>
      validateFamousStarEntry(baseEntry({ variable: { type: 'SRC', magRange: [1.3, 0.0] } })),
    ).toThrow(/variable/);
  });

  it('accepts a well-formed variable', () => {
    const e = baseEntry({ variable: { type: 'SRC', magRange: [0.0, 1.3] } });
    expect(validateFamousStarEntry(e).variable).toEqual({ type: 'SRC', magRange: [0.0, 1.3] });
  });

  it('throws on out-of-range magV / absMag', () => {
    expect(() => validateFamousStarEntry(baseEntry({ magV: -40 }))).toThrow(/magV/);
    expect(() => validateFamousStarEntry(baseEntry({ magV: 20 }))).toThrow(/magV/);
    expect(() => validateFamousStarEntry(baseEntry({ absMag: -20 }))).toThrow(/absMag/);
    expect(() => validateFamousStarEntry(baseEntry({ absMag: 25 }))).toThrow(/absMag/);
  });

  it("accepts the Sun's magV -26.74", () => {
    const e = baseEntry({ id: 'sun', magV: -26.74, absMag: 4.83, gaiaDr3: null });
    expect(validateFamousStarEntry(e).magV).toBe(-26.74);
  });

  it('parseFamousStarsSeed carries entries through the array', () => {
    const json = JSON.stringify([baseEntry({ id: 'sirius' }), baseEntry({ id: 'vega' })]);
    const out = parseFamousStarsSeed(json);
    expect(out.map((e) => e.id)).toEqual(['sirius', 'vega']);
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
