import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMilliquas } from '../../tools/parsers/milliquas';
import { Source } from '../../src/data/sources';

describe('parseMilliquas', () => {
  const raw = readFileSync(resolve(__dirname, '../fixtures/milliquas/sample.txt'), 'utf8');

  it('parses 3C 273 with the expected fields and a quasar class byte', () => {
    const { records } = parseMilliquas(raw);
    const i = records.findIndex(
      (r) => Math.abs(r.ra - 187.2779) < 1e-3 && Math.abs(r.dec - 2.0524) < 1e-3,
    );
    expect(i).toBeGreaterThanOrEqual(0);
    const r = records[i]!;
    expect(r.source).toBe(Source.Milliquas);
    expect(r.z).toBeCloseTo(0.158, 3);
    expect(r.magR).toBeCloseTo(12.85, 2);
    expect(r.magG).toBeCloseTo(13.05, 2);
    expect(r.axisRatio).toBeNull();
    expect(r.positionAngleDeg).toBeNull();
    expect(r.diameterKpc).toBeNull();
    expect(r.objID).toBe(0n);
    // Quasar class letter Q maps to enum 1.
    expect(r.classByte).toBe(1);
    // 3C 273 is a literature designation — no parent-survey prefix.
    expect(r.parentSurveyByte).toBe(0);
  });

  it('rejects non-positive z rows (z=0 sentinel and bad negative measurements)', () => {
    // A quasar/AGN catalog has no physical z <= 0; a negative z is a bad
    // measurement or a misclassified foreground object. The fixture carries
    // both a 0.000 sentinel row and a -0.001 row; neither may survive.
    const { records, skipped } = parseMilliquas(raw);
    expect(records.every((r) => r.z > 0)).toBe(true);
    // Both the zero and the negative row land in the same counter.
    expect(skipped.zNonPositive).toBeGreaterThanOrEqual(2);
  });

  it('treats a literal 0 magnitude as missing, not as a real measurement', () => {
    // Milliquas marks an absent magnitude with `0`, not a blank. The real
    // Circinus row (appended to the fixture verbatim) reads Rmag=10.93 with
    // Bmag=0 — R measured, B absent. Letting the 0 through is not merely
    // imprecise: at Circinus' 4 Mpc an m=0 back-solves to M=-28, which the
    // surface-brightness model reads as ~240x a typical galaxy and renders
    // as a blown-out white blob. Guard the sentinel, keep the real R.
    const { records } = parseMilliquas(raw);
    const circinus = records.find((r) => Math.abs(r.ra - 213.2915) < 1e-3);
    expect(circinus).toBeDefined();
    expect(circinus!.magR).toBeCloseTo(10.93, 2);
    expect(circinus!.magG).toBeNaN();
  });

  it('rejects 0.1-rounded photo-z candidate rows', () => {
    const { skipped } = parseMilliquas(raw);
    expect(skipped.photoZRounded).toBeGreaterThan(0);
  });

  it('rejects 0.01-rounded GAIA3 QSOC photo-z rows', () => {
    const { skipped } = parseMilliquas(raw);
    expect(skipped.qsocRounded).toBeGreaterThan(0);
  });

  it('maps each class letter to the correct enum value', () => {
    const { records } = parseMilliquas(raw);
    const byClassLetter: Record<string, number> = {
      Q: 1, // Quasar
      A: 2, // AGN type-1
      B: 3, // BL Lac
      K: 4, // Seyfert-1 narrow
      N: 5, // Seyfert-1 broad
      S: 6, // Candidate
    };
    for (const [letter, expectedByte] of Object.entries(byClassLetter)) {
      const found = records.some((r) => r.classByte === expectedByte);
      expect(
        found,
        `expected at least one record with classByte=${expectedByte} (class ${letter})`,
      ).toBe(true);
    }
  });

  it('detects each parent-survey prefix and emits the matching enum byte', () => {
    const { records } = parseMilliquas(raw);
    const surveyBytes = new Set(records.map((r) => r.parentSurveyByte));
    expect(surveyBytes.has(1)).toBe(true); // SDSS
    expect(surveyBytes.has(0)).toBe(true); // literature
  });
});
