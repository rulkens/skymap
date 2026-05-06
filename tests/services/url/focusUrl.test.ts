/**
 * Tests for the pure focus-id URL codec.
 *
 * The codec encodes a galaxy selection into the `#focus=<id>` hash and
 * decodes the inverse.  These tests exercise the priority ladder
 * (famous > pgc > sdss > pos fallback > synthetic-rejected) and the
 * round-trip through bigint-precision SDSS objIDs, which exceed JS's
 * Number.MAX_SAFE_INTEGER.
 */

import { describe, it, expect } from 'vitest';
import {
  selectionToFocusId,
  parseFocusHash,
} from '../../../src/services/url/focusUrl';
import { Source } from '../../../src/data/sources';
import type { PointInfo } from '../../../src/@types';

/**
 * Build a minimal `PointInfo` for codec tests.  The codec only reads
 * `source`, `objID`, `ra`, `dec`, and `famous`, so the rest is filler
 * that satisfies the type without claiming to be physically meaningful.
 * We cast through `unknown` because typing every field would obscure
 * what the test is actually exercising.
 */
const baseInfo = (overrides: Partial<PointInfo>): PointInfo =>
  ({
    index: 0,
    objID: 0n,
    x: 0,
    y: 0,
    z: 0,
    ra: 10.123,
    dec: -5.456,
    raSexagesimal: '00h00m00s',
    decSexagesimal: "+00°00'00\"",
    redshift: 0.01,
    distanceMpc: 40,
    hubbleVelocityKmS: 3000,
    lookbackGyr: 0.1,
    earthEra: 'recent',
    magU: 18,
    magG: 18,
    magR: 18,
    magI: 18,
    magZ: 18,
    bands: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
    colours: [],
    absoluteMagG: -20,
    galaxyType: { category: 'unknown', description: '' } as PointInfo['galaxyType'],
    iauName: 'X',
    displayName: 'X',
    source: Source.Glade,
    sourceLabel: 'GLADE',
    catalogUrl: null,
    diameterKpc: 30,
    diameterProvenance: 'fallback (30 kpc)',
    orientation: { axisRatio: 1, positionAngleDeg: 0, provenance: 'deterministic fallback' },
    thumbnailUrl: 'https://example.test/thumb.jpg',
    ...overrides,
  }) as unknown as PointInfo;

describe('selectionToFocusId', () => {
  it('returns the famous seed id when info.famous is present', () => {
    const info = baseInfo({
      source: Source.Famous,
      famous: {
        id: 'm31',
        names: ['M31', 'Andromeda Galaxy'],
        description: '',
        type: 'SBb',
        xref: null,
      },
    });
    expect(selectionToFocusId(info)).toBe('m31');
  });

  it('returns pgc-<n> for a non-SDSS source with objID > 0n', () => {
    expect(
      selectionToFocusId(baseInfo({ source: Source.Glade, objID: 2789n })),
    ).toBe('pgc-2789');
  });

  it('returns pgc-<n> for a 2MRS row with a real PGC objID', () => {
    expect(
      selectionToFocusId(baseInfo({ source: Source.TwoMRS, objID: 12345n })),
    ).toBe('pgc-12345');
  });

  it('returns sdss-<n> for an SDSS row with a 19-digit bigint objID', () => {
    expect(
      selectionToFocusId(
        baseInfo({ source: Source.SDSS, objID: 1237665128253423687n }),
      ),
    ).toBe('sdss-1237665128253423687');
  });

  it('falls back to pos@ra,dec rounded to 4 decimals when objID is 0n', () => {
    const info = baseInfo({
      source: Source.TwoMRS,
      objID: 0n,
      ra: 10.1234567,
      dec: -5.4567,
    });
    expect(selectionToFocusId(info)).toBe('pos@10.1235,-5.4567');
  });

  it('rounds positive declinations to 4 decimals in pos fallback', () => {
    const info = baseInfo({
      source: Source.Glade,
      objID: 0n,
      ra: 359.99999,
      dec: 89.5,
    });
    // ra rounds up to 360.0000 (codec doesn't normalise wrap; that's fine)
    expect(selectionToFocusId(info)).toBe('pos@360.0000,89.5000');
  });

  it('returns null for synthetic-source rows (not link-encodable)', () => {
    expect(
      selectionToFocusId(baseInfo({ source: Source.Synthetic })),
    ).toBeNull();
  });
});

describe('parseFocusHash', () => {
  it('parses a famous-id hash', () => {
    expect(parseFocusHash('#focus=m31')).toEqual({ kind: 'famous', id: 'm31' });
  });

  it('parses a pgc hash to a bigint', () => {
    expect(parseFocusHash('#focus=pgc-2789')).toEqual({
      kind: 'pgc',
      pgc: 2789n,
    });
  });

  it('parses an sdss hash with full 19-digit bigint round-trip', () => {
    expect(parseFocusHash('#focus=sdss-1237665128253423687')).toEqual({
      kind: 'sdss',
      objID: 1237665128253423687n,
    });
  });

  it('parses a pos hash with negative declination', () => {
    expect(parseFocusHash('#focus=pos@10.1235,-5.4567')).toEqual({
      kind: 'pos',
      raDeg: 10.1235,
      decDeg: -5.4567,
    });
  });

  it('parses a pos hash with positive declination', () => {
    expect(parseFocusHash('#focus=pos@123.0000,45.6789')).toEqual({
      kind: 'pos',
      raDeg: 123.0,
      decDeg: 45.6789,
    });
  });

  it('returns null for an unrecognised hash key', () => {
    expect(parseFocusHash('#bogus')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseFocusHash('')).toBeNull();
  });

  it('returns null for #focus= with no value', () => {
    expect(parseFocusHash('#focus=')).toBeNull();
  });

  it('returns null for malformed pgc with non-numeric body', () => {
    expect(parseFocusHash('#focus=pgc-abc')).toBeNull();
  });

  it('returns null for malformed sdss with non-numeric body', () => {
    expect(parseFocusHash('#focus=sdss-xyz')).toBeNull();
  });

  it('returns null for pos@ with non-numeric coordinates', () => {
    expect(parseFocusHash('#focus=pos@bad,values')).toBeNull();
  });
});
