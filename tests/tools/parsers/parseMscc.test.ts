import { describe, it, expect } from 'vitest';
import { parseMscc, type MsccRow } from '../../../tools/parsers/parseMscc';

/**
 * Fixture rows copied VERBATIM from `data/raw/mscc/mscc.dat`
 * (VizieR J/MNRAS/445/4073, Chow-Martinez et al. 2014), preserving every
 * space so the fixed-width byte offsets are real.
 *
 * Why verbatim copies rather than hand-crafted strings?  The whole point of
 * fixed-width parsing is that column position is the field separator — if we
 * invented the spacing we'd be testing an imaginary format.  Copying from the
 * real file means the tests exercise the same byte layout the production parser
 * will face on every `npm run build-all` invocation.
 *
 * Row coverage (0-based array indices when passed together):
 *   ROW_1  — MSCC 1; negative dec (−26.72°); 9 member clusters.
 *   ROW_2  — MSCC 2; SCLs cross-ref present ('3'); positive dec (+09.77°).
 *   ROW_3  — MSCC 3; positive dec (+16.05°); no SCLs cross-ref.
 *   ROW_6  — MSCC 6; strongly negative dec (−64.24°); tests southern sky.
 */
const ROW_1 =
  '  1                     9   0.77 -26.72 0.064  50.6 A0014,A0020,A2683A,A2716,A2726A,A2734,A4038C,A4049B,A4053B';
const ROW_2 =
  '  2  3                  2   1.09 +09.77 0.098  20.2 A2694,A2706';
const ROW_3 =
  '  3                     4   1.20 +16.05 0.119  41.5 A0001,A2688A,A2703,A2705';
const ROW_6 =
  '  6                     4   1.58 -64.24 0.116  37.7 A2732,A2740A,A2760,A4028';

describe('parseMscc', () => {
  describe('reads decimal RAdeg/DEdeg, z, Nm, dmax', () => {
    it('parses MSCC 1 with correct numeric fields and id', () => {
      const rows = parseMscc(ROW_1);
      expect(rows).toHaveLength(1);
      const row = rows[0] as MsccRow;
      // id: 'MSCC ' + parseInt(Seq), not zero-padded
      expect(row.id).toBe('MSCC 1');
      // RAdeg column (bytes 27-32): '  0.77' → 0.77
      expect(row.raDeg).toBeCloseTo(0.77, 2);
      // DEdeg column (bytes 34-39): '-26.72' → −26.72
      expect(row.decDeg).toBeCloseTo(-26.72, 2);
      // z column (bytes 41-45): '0.064' → 0.064
      expect(row.z).toBeCloseTo(0.064, 3);
      // Nm column (bytes 24-25): ' 9' → 9
      expect(row.nm).toBe(9);
      // dmax column (bytes 47-51): ' 50.6' → 50.6 (raw h70^-1 Mpc, not converted)
      expect(row.dmaxMpc).toBeCloseTo(50.6, 1);
    });
  });

  describe('reads a signed positive declination', () => {
    it('parses MSCC 2 with positive declination +09.77', () => {
      const rows = parseMscc(ROW_2);
      expect(rows).toHaveLength(1);
      const row = rows[0] as MsccRow;
      // DEdeg column (bytes 34-39): '+09.77' — the F6.2 field includes the
      // sign character; parseFloat handles '+' prefix transparently.
      expect(row.decDeg).toBeCloseTo(9.77, 2);
      expect(row.decDeg).toBeGreaterThan(0);
    });

    it('parses MSCC 3 with another positive declination +16.05', () => {
      const rows = parseMscc(ROW_3);
      expect(rows).toHaveLength(1);
      const row = rows[0] as MsccRow;
      expect(row.decDeg).toBeCloseTo(16.05, 2);
    });

    it('parses MSCC 2 id without zero-padding', () => {
      const rows = parseMscc(ROW_2);
      expect(rows[0]!.id).toBe('MSCC 2');
    });
  });

  describe('skips comment and blank lines', () => {
    it('ignores lines starting with # and blank lines', () => {
      const input = [
        '# VizieR comment line',
        '',
        ROW_1,
        '   ',
        '# Another comment',
        ROW_2,
      ].join('\n');
      const rows = parseMscc(input);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.id).toBe('MSCC 1');
      expect(rows[1]!.id).toBe('MSCC 2');
    });

    it('returns an empty array when given only blanks and comments', () => {
      const rows = parseMscc('# comment\n\n# another\n');
      expect(rows).toHaveLength(0);
    });

    it('returns an empty array for an empty string', () => {
      expect(parseMscc('')).toHaveLength(0);
    });
  });

  describe('parses all four fixture rows together', () => {
    it('produces 4 rows with correct ids and numeric fields', () => {
      const input = [ROW_1, ROW_2, ROW_3, ROW_6].join('\n');
      const rows = parseMscc(input);
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.id)).toEqual(['MSCC 1', 'MSCC 2', 'MSCC 3', 'MSCC 6']);
      // Spot-check MSCC 6: strongly negative southern declination
      const row6 = rows[3] as MsccRow;
      expect(row6.decDeg).toBeCloseTo(-64.24, 2);
      expect(row6.raDeg).toBeCloseTo(1.58, 2);
      expect(row6.z).toBeCloseTo(0.116, 3);
      expect(row6.nm).toBe(4);
      expect(row6.dmaxMpc).toBeCloseTo(37.7, 1);
    });
  });
});
