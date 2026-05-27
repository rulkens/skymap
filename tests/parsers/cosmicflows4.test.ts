import { describe, it, expect } from 'vitest';
import { parseCf4Line } from '../../tools/parsers/cosmicflows4';

/**
 * Build a fixed-width CF4 line by overlaying field values at the byte
 * ranges documented in the CDS Vizier ReadMe for J/ApJ/944/94 table2.dat.
 *
 * The exact byte offsets here MUST match the offsets the parser reads
 * (which in turn match the ReadMe). The test is the only place all
 * three values are pinned together, so a future re-layout of the table
 * produces a focused parser test failure instead of a silently-empty
 * distance lookup.
 *
 * Verified against data/raw/cf4/ReadMe on 2026-05-27:
 *   PGC   bytes  1- 7  (I7)
 *   DM    bytes 29-34  (F6.3, mag)
 *   e_DM  bytes 36-40  (F5.3, mag)
 *   RAdeg bytes 138-145 (F8.4, deg) — not parsed but pinned by row width
 *   DEdeg bytes 147-154 (F8.4, deg)
 *
 * The CF4 table runs to byte 190 (`SGB` field); we pad to that width.
 */
function buildCf4Row(fields: {
  pgc?: string;
  dm?: string;
  eDm?: string;
  raDeg?: string;
  deDeg?: string;
}): string {
  const buf = ' '.repeat(190).split('');
  function put(start: number, end: number, val: string): void {
    const slot = end - start + 1;
    const padded = val.padStart(slot).slice(0, slot);
    for (let i = 0; i < slot; i++) buf[start - 1 + i] = padded[i]!;
  }
  if (fields.pgc !== undefined) put(1, 7, fields.pgc);
  if (fields.dm !== undefined) put(29, 34, fields.dm);
  if (fields.eDm !== undefined) put(36, 40, fields.eDm);
  if (fields.raDeg !== undefined) put(138, 145, fields.raDeg);
  if (fields.deDeg !== undefined) put(147, 154, fields.deDeg);
  return buf.join('');
}

describe('parseCf4Line', () => {
  it('extracts PGC, distance modulus, and uncertainty for a real row (M31)', () => {
    const line = buildCf4Row({
      pgc: '2557',
      dm: '24.470', // → 10^((24.47-25)/5) = 0.7852 Mpc
      eDm: '0.120',
    });
    const rec = parseCf4Line(line);
    expect(rec).not.toBeNull();
    expect(rec!.pgc).toBe(2557);
    expect(rec!.distMpc).toBeCloseTo(0.785, 2);
    expect(rec!.eDistMpc).toBeGreaterThan(0);
  });

  it('returns null when DM is blank (catalogued row with no distance)', () => {
    const line = buildCf4Row({ pgc: '999', dm: '', eDm: '' });
    expect(parseCf4Line(line)).toBeNull();
  });

  it('treats missing PGC (zero or blank) as null in the record, not 0', () => {
    const line = buildCf4Row({ pgc: '0', dm: '31.000', eDm: '0.200' });
    const rec = parseCf4Line(line);
    expect(rec).not.toBeNull();
    expect(rec!.pgc).toBeNull();
  });

  it('parses a real galactic distance (NGC 4258 = M106 maser anchor)', () => {
    // PGC 39600 = NGC 4258. CF4 gives ~7.4 Mpc; DM = 25 + 5*log10(7.4) ≈ 29.35
    const line = buildCf4Row({ pgc: '39600', dm: '29.350', eDm: '0.030' });
    const rec = parseCf4Line(line);
    expect(rec).not.toBeNull();
    expect(rec!.pgc).toBe(39600);
    expect(rec!.distMpc).toBeCloseTo(7.41, 1);
  });
});
