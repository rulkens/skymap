/**
 * Tests for buildFamousStars — the seed → (generated table, meta sidecar) split.
 *
 * The tool's filesystem `main()` is a thin composition; the behaviour worth
 * pinning is the two pure projections, so these feed an inline fixture straight
 * to `seedToGeneratedRows` / `seedToMetaEntries` and never touch disk. The
 * fixture spans the shapes that decide the projection: a plain spherical star,
 * one carrying the optional `oblateness` + `variable`, and one with a `null`
 * gaiaDr3 and an omitted `massSolar` (the optional-field discipline the runtime
 * relies on — an absent value must be an absent key, never `null`/`0`).
 */
import { describe, expect, it } from 'vitest';
import type { FamousStarEntry } from '../../../tools/parsers/famousStarsSeed';
import {
  seedToGeneratedRows,
  seedToMetaEntries,
  seedToRustConst,
  serializeGeneratedTable,
} from '../../../tools/famous/buildFamousStars';

const FIXTURE: FamousStarEntry[] = [
  {
    id: 'sirius',
    commonName: 'Sirius',
    names: ['Sirius', 'Alpha Canis Majoris'],
    constellation: 'Canis Major',
    ra: 101.28715,
    dec: -16.716116,
    distancePc: 2.64,
    magV: -1.46,
    absMag: 1.42,
    spectralType: 'A1 V',
    radiusSolar: 1.71,
    temperatureK: 9940,
    massSolar: 2.06,
    luminositySolar: 25.4,
    gaiaDr3: '2947050466531873024',
    description: 'The brightest star in the night sky.',
  },
  {
    id: 'achernar',
    commonName: 'Achernar',
    names: ['Achernar', 'Alpha Eridani'],
    constellation: 'Eridanus',
    ra: 24.42852,
    dec: -57.236753,
    distancePc: 43.98,
    magV: 0.46,
    absMag: -1.46,
    spectralType: 'B6 Vep',
    radiusSolar: 7.3,
    temperatureK: 15000,
    oblateness: 0.35,
    variable: { type: 'Be', magRange: [0.4, 0.6] },
    gaiaDr3: '4732214452838183424',
    description: 'The flattest known star, spun near breakup.',
  },
  {
    id: 'proxima-centauri',
    commonName: 'Proxima Centauri',
    names: ['Proxima Centauri', 'Alpha Centauri C'],
    constellation: 'Centaurus',
    ra: 217.42895,
    dec: -62.679484,
    distancePc: 1.3,
    magV: 11.13,
    absMag: 15.6,
    spectralType: 'M5.5 Ve',
    radiusSolar: 0.15,
    temperatureK: 3042,
    gaiaDr3: null,
    description: 'The nearest star to the Sun.',
  },
];

describe('seedToGeneratedRows', () => {
  it('projects a fixture seed into the generated table', () => {
    const [sirius, achernar] = seedToGeneratedRows(FIXTURE);

    // Spherical star: exactly the render + search fields, no oblateness.
    expect(Object.keys(sirius!).sort()).toEqual(
      [
        'absMag',
        'commonName',
        'constellation',
        'decDeg',
        'distancePc',
        'id',
        'names',
        'radiusSolar',
        'raDeg',
        'temperatureK',
      ].sort(),
    );
    expect(sirius!.raDeg).toBe(101.28715);
    expect(sirius!.decDeg).toBe(-16.716116);

    // Oblate star carries the optional key.
    expect(achernar!.oblateness).toBe(0.35);

    // No physical/prose fields leak into the render table.
    for (const row of seedToGeneratedRows(FIXTURE)) {
      expect(row).not.toHaveProperty('description');
      expect(row).not.toHaveProperty('spectralType');
      expect(row).not.toHaveProperty('magV');
      expect(row).not.toHaveProperty('variable');
    }
  });
});

describe('seedToMetaEntries', () => {
  it('projects a fixture seed into the sidecar', () => {
    const [sirius, achernar, proxima] = seedToMetaEntries(FIXTURE);

    // Physical fields + prose ride the sidecar.
    expect(sirius!.spectralType).toBe('A1 V');
    expect(sirius!.magV).toBe(-1.46);
    expect(sirius!.description).toBe('The brightest star in the night sky.');

    // An omitted optional is an ABSENT key, not 0/null — verified through a JSON
    // round-trip so we test the shape that actually ships.
    const proximaJson = JSON.parse(JSON.stringify(proxima));
    expect('massSolar' in proximaJson).toBe(false);
    expect('gaiaDr3' in proximaJson).toBe(false); // dedup-only field, never in the meta sidecar

    // Structured variability round-trips intact.
    expect(achernar!.variable).toEqual({ type: 'Be', magRange: [0.4, 0.6] });
  });
});

describe('serializeGeneratedTable', () => {
  it('emits the banner, typed export, and omits absent optional keys', () => {
    const text = serializeGeneratedTable(seedToGeneratedRows(FIXTURE));

    expect(text).toContain('!!! GENERATED FILE — DO NOT EDIT BY HAND !!!');
    expect(text).toContain('npm run build-famous-stars');
    expect(text).toContain(
      "import type { FamousStarRow } from '../../@types/data/FamousStarRow';",
    );
    expect(text).toContain('export const FAMOUS_STARS_GENERATED: readonly FamousStarRow[] = [');
    // Single-quoted strings, no oblateness key for the spherical Sirius row.
    expect(text).toContain("id: 'sirius',");
    expect(text).toContain('oblateness: 0.35,');
    expect(text).not.toContain('description');
  });
});

describe('seedToRustConst', () => {
  it('emits a u64 array of the non-null gaiaDr3 ids, excluding the null entry', () => {
    const text = seedToRustConst(FIXTURE);

    expect(text).toContain('!!! GENERATED FILE — DO NOT EDIT BY HAND !!!');
    // Sirius + Achernar carry a gaiaDr3; Proxima's is null, so the array length
    // is 2 — nothing hardcodes 17. The length tracks the non-null seed count.
    expect(text).toContain('pub const FAMOUS_STAR_GAIA_IDS: [u64; 2] = [');
    // Each id is a bare u64 literal with the star id as a provenance comment.
    expect(text).toContain('2947050466531873024, // sirius');
    expect(text).toContain('4732214452838183424, // achernar');
    // The null entry contributes no element — Proxima's id never appears.
    expect(text).not.toContain('proxima-centauri');
  });
});
