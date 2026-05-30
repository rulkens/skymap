import { describe, it, expect } from 'vitest';
import { parseMcxc, type McxcRow } from '../../../tools/parsers/parseMcxc';

/**
 * Fixture rows copied VERBATIM from `data/raw/mcxc/mcxc.dat` (J/A+A/534/A109),
 * preserving every space so the fixed-width byte offsets are real.
 *
 * Why verbatim copies rather than hand-crafted strings?  The whole point of
 * fixed-width parsing is that column position is the field separator — if we
 * invented the spacing we'd be testing an imaginary format.  Copying from the
 * real file means the tests exercise the same byte layout the production parser
 * will face on every `npm run build-all` invocation.
 *
 * Row coverage:
 *   ROW_WITH_ANAME  — row 1 in the file; AName = 'UGC 12890'; positive dec.
 *   ROW_NO_ANAME    — row 2; AName all spaces; negative dec (-2.625°).
 *   ROW_DEEP_SOUTH  — row 3; AName all spaces; strongly negative dec (-15.681°).
 *   ROW_ABELL       — row 4; AName = 'A2692' (Abell cluster designation).
 */
const ROW_WITH_ANAME =
  'J0000.1+0816 RXC J0000.1+0816   UGC 12890                                               0  0  7.1   8 16 28   0.030   8.274 101.783 -52.477 0.0396 NORAS/REFLEX NORAS        0.784  0.196280  0.7373  0.6296                                            BCS                                                 1.084';
const ROW_NO_ANAME =
  'J0000.4-0237 RXC J0000.4-0237                                                           0  0 24.7 - 2 37 30   0.103  -2.625  94.268 -62.622 0.0379 SGP          SGP          0.752  0.052338  0.3297  0.4817';
const ROW_DEEP_SOUTH =
  'J0001.6-1540 RXC J0001.6-1540                                                           0  1 39.0 -15 40 52   0.412 -15.681  75.129 -73.733 0.1246 SGP          SGP          2.234  0.814902  1.6557  0.8021';
const ROW_ABELL =
  'J0001.9+1204 RXC J0001.9+1204   A2692                                                   0  1 57.0  12  4 23   0.488  12.073 104.308 -49.001 0.2033 NORAS/REFLEX NORAS        3.342  1.990205  2.6927  0.9178';

describe('parseMcxc', () => {
  describe('reads decimal RAdeg/DEdeg, z, M500, R500', () => {
    it('parses row 0 (J0000.1+0816) with correct numeric fields', () => {
      const rows = parseMcxc(ROW_WITH_ANAME);
      expect(rows).toHaveLength(1);
      const row = rows[0] as McxcRow;
      // RAdeg column (bytes 109-115): '  0.030' → 0.030
      expect(row.raDeg).toBeCloseTo(0.030, 3);
      // DEdeg column (bytes 117-123): '  8.274' → 8.274
      expect(row.decDeg).toBeCloseTo(8.274, 3);
      // z column (bytes 141-146): '0.0396'
      expect(row.z).toBeCloseTo(0.0396, 4);
      // M500 column (bytes 190-196): ' 0.7373' (10^14 M☉)
      expect(row.m500).toBeCloseTo(0.7373, 4);
      // R500 column (bytes 198-204): ' 0.6296' (Mpc)
      expect(row.r500Mpc).toBeCloseTo(0.6296, 4);
    });

    it('parses id, oName, and aName for the first row', () => {
      const rows = parseMcxc(ROW_WITH_ANAME);
      const row = rows[0] as McxcRow;
      // MCXC primary id: bytes 1-12, trimmed
      expect(row.id).toBe('J0000.1+0816');
      // OName: bytes 14-31, trimmed — 'RXC J0000.1+0816' (trailing spaces stripped)
      expect(row.oName).toBe('RXC J0000.1+0816');
      // AName: bytes 33-86, trimmed — 'UGC 12890'
      expect(row.aName).toBe('UGC 12890');
    });
  });

  describe('reads a signed southern declination', () => {
    it('returns negative decDeg for row J0000.4-0237', () => {
      const rows = parseMcxc(ROW_NO_ANAME);
      expect(rows).toHaveLength(1);
      const row = rows[0] as McxcRow;
      // DEdeg column: ' -2.625' — the minus sign is part of the F7.3 value
      expect(row.decDeg).toBeCloseTo(-2.625, 3);
      expect(row.decDeg).toBeLessThan(0);
    });

    it('returns negative decDeg for a more southern row (J0001.6-1540)', () => {
      const rows = parseMcxc(ROW_DEEP_SOUTH);
      expect(rows).toHaveLength(1);
      const row = rows[0] as McxcRow;
      expect(row.decDeg).toBeCloseTo(-15.681, 3);
    });
  });

  describe('returns blank AName as empty string', () => {
    it('gives aName="" when AName column is all spaces', () => {
      // ROW_NO_ANAME has bytes 33-86 entirely blank in the source file.
      const rows = parseMcxc(ROW_NO_ANAME);
      expect(rows).toHaveLength(1);
      expect((rows[0] as McxcRow).aName).toBe('');
    });

    it('gives non-empty aName for a row with an Abell designation', () => {
      const rows = parseMcxc(ROW_ABELL);
      expect(rows).toHaveLength(1);
      expect((rows[0] as McxcRow).aName).toBe('A2692');
    });
  });

  describe('skips comment and blank lines', () => {
    it('ignores lines starting with # and blank lines', () => {
      const input = [
        '# This is a VizieR comment',
        '',
        ROW_WITH_ANAME,
        '   ',
        '# Another comment',
        ROW_NO_ANAME,
      ].join('\n');
      const rows = parseMcxc(input);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.id).toBe('J0000.1+0816');
      expect(rows[1]!.id).toBe('J0000.4-0237');
    });

    it('returns an empty array when given only blank and comment lines', () => {
      const rows = parseMcxc('# comment\n\n# another\n');
      expect(rows).toHaveLength(0);
    });

    it('returns an empty array for an empty string', () => {
      expect(parseMcxc('')).toHaveLength(0);
    });
  });

  describe('parses all four fixture rows together', () => {
    it('produces 4 rows with correct ids when all are present', () => {
      const input = [ROW_WITH_ANAME, ROW_NO_ANAME, ROW_DEEP_SOUTH, ROW_ABELL].join('\n');
      const rows = parseMcxc(input);
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.id)).toEqual([
        'J0000.1+0816',
        'J0000.4-0237',
        'J0001.6-1540',
        'J0001.9+1204',
      ]);
    });
  });
});
