import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMilliquas } from '../../tools/parsers/milliquas';
import { Source } from '../../src/data/sources';

describe('parseMilliquas', () => {
  const raw = readFileSync(resolve(__dirname, '../fixtures/milliquas/sample.txt'), 'utf8');

  it('parses 3C 273 with the expected fields', () => {
    const { records, names, classes } = parseMilliquas(raw);
    const i = names.findIndex((n) => n === '3C 273');
    expect(i).toBeGreaterThanOrEqual(0);
    const r = records[i]!;
    expect(r.source).toBe(Source.Milliquas);
    expect(r.ra).toBeCloseTo(187.2779, 3);
    expect(r.dec).toBeCloseTo(2.0524, 3);
    expect(r.z).toBeCloseTo(0.158, 3);
    expect(r.magR).toBeCloseTo(12.85, 2);
    expect(Number.isFinite(r.magG)).toBe(true);
    expect(r.magG).toBeCloseTo(13.05, 2);
    expect(r.axisRatio).toBeNull();
    expect(r.positionAngleDeg).toBeNull();
    expect(r.diameterKpc).toBeNull();
    expect(r.objID).toBe(0n);
    expect(classes[i]).toBe('Q');
  });

  it('rejects z=0 sentinel rows', () => {
    const { records, names, skipped } = parseMilliquas(raw);
    expect(names).not.toContain('FAKE_ZERO_REDSHIFT');
    expect(records.every((r) => r.z !== 0)).toBe(true);
    expect(skipped.zZero).toBeGreaterThan(0);
  });

  it('rejects 0.1-rounded photo-z candidate rows', () => {
    const { names, skipped } = parseMilliquas(raw);
    expect(names).not.toContain('FAKE_PHOTOZ_CANDIDATE');
    expect(skipped.photoZRounded).toBeGreaterThan(0);
  });

  it('rejects 0.01-rounded GAIA3 QSOC photo-z rows', () => {
    const { names, skipped } = parseMilliquas(raw);
    expect(names).not.toContain('FAKE_GAIA_QSOC');
    expect(skipped.qsocRounded).toBeGreaterThan(0);
  });

  it('accepts ordinary spec-z row even with Zcite that resembles a photo-z source', () => {
    const { names } = parseMilliquas(raw);
    expect(names).toContain('FAKE_PLAIN_SPECZ');
  });

  it('accepts rows with blank Bmag (Rmag-only)', () => {
    const { records, names } = parseMilliquas(raw);
    const i = names.findIndex((n) => n === 'FAKE_RMAG_ONLY');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(records[i]!.magR)).toBe(true);
    expect(Number.isNaN(records[i]!.magG)).toBe(true);
  });

  it('preserves all six classification codes through the classes sidecar', () => {
    const { names, classes } = parseMilliquas(raw);
    const expectations: Array<[string, string]> = [
      ['3C 273', 'Q'],
      ['NGC 4151', 'A'],
      ['SDSS J100022.5+023521', 'K'],
      ['NGC 1068', 'N'],
      ['Mrk 421', 'B'],
      ['FAKE_STAR_CAND', 'S'],
    ];
    for (const [name, cls] of expectations) {
      const i = names.findIndex((n) => n === name);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(classes[i]).toBe(cls);
    }
  });
});
