import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRegalade, parseRegaladeLine } from '../../../tools/parsers/regalade';
import { redshiftToDistanceMpc } from '../../../src/utils/math/redshiftToDistanceMpc';

/**
 * Twenty rows copied verbatim from the head of `regalade.dat` (VizieR
 * J/A+A/706/A284, 2026-09-02 version), each exactly 348 bytes. Real rows
 * rather than hand-built ones: the ReadMe offsets are 1-based inclusive and a
 * ±1 slip only shows against known values. The pick covers every sentinel
 * the parser must survive: `---` in each magnitude slot, PA outside [0, 180),
 * the 3″ circular placeholder ellipse, fRel = 1, and both spectroscopic and
 * photometric `Refzin` parents.
 */
const SAMPLE = readFileSync(resolve(__dirname, '../../fixtures/regalade/sample.dat'), 'utf8');
const LINES = SAMPLE.split('\n').filter((l) => l !== '');

/** Rewrite bytes [start, end] (1-based inclusive, ReadMe numbering) of a row. */
function withBytes(line: string, start: number, end: number, field: string): string {
  return line.slice(0, start - 1) + field.padStart(end - start + 1) + line.slice(end);
}

describe('parseRegalade', () => {
  const { records, skipped } = parseRegalade(SAMPLE);

  it('keeps every real row', () => {
    expect(skipped).toBe(0);
    expect(records).toHaveLength(20);
    for (const r of records) {
      expect(r.objID).toBe(0n);
      expect(r.magU).toBeNaN();
      expect(r.classByte).toBe(0);
      expect(Number.isFinite(r.z) && r.z > 0).toBe(true);
    }
  });

  it('places a row at its luminosity distance, not a comoving reading of it', () => {
    // Row 0: Dist = 1200.548340 Mpc (DistTmean, a GSC-blue photo-z row).
    const r = records[0]!;
    expect(r.ra).toBeCloseTo(0.000012, 6);
    expect(r.dec).toBeCloseTo(28.903549, 6);
    expect((1 + r.z) * redshiftToDistanceMpc(r.z)).toBeCloseTo(1200.548, 2);
    // Reading Dist as comoving would put z ≈ 0.30; the luminosity inverse is ≈ 0.24.
    expect(r.z).toBeLessThan(0.26);
  });

  it('agrees with the catalogued z to ~1 % where Dist came from that z', () => {
    // Row 7: Refzin = 4 (DESI DR1), z = 2.50291e-01, Dist = 1250.878906 from it.
    // A comoving misread would miss by ~19 %; the residual is the H0 gap.
    const r = records[7]!;
    expect(r.spectroscopicZ).toBeCloseTo(0.250291, 6);
    expect(Math.abs(r.z - 0.250291) / 0.250291).toBeLessThan(0.02);
  });

  it('surfaces spectroscopicZ only for spectroscopic Refzin parents', () => {
    expect(records[9]!.spectroscopicZ).toBeCloseTo(0.128522, 6); // Refzin 3, DESI PV
    expect(records[14]!.spectroscopicZ).toBeCloseTo(0.0399993, 7); // Refzin 7, NED-LVS-zsp
    expect(records[0]!.spectroscopicZ).toBeNaN(); // Refzin 13, GSC blue photo-z
    expect(records[1]!.spectroscopicZ).toBeNaN(); // Refzin 9, GLADE+
    expect(records[16]!.spectroscopicZ).toBeNaN(); // Refzin 1, GLADE1
  });

  it('reads the four Kron magnitudes and collapses --- to NaN per slot', () => {
    const r0 = records[0]!;
    expect(r0.magG).toBeCloseTo(21.55339, 5);
    expect(r0.magR).toBeCloseTo(20.96793, 5);
    expect(r0.magI).toBeCloseTo(21.0466, 5);
    expect(r0.magZ).toBeCloseTo(20.67912, 5);
    // Row 2: only imag is ---.
    const r2 = records[2]!;
    expect(r2.magI).toBeNaN();
    expect(r2.magR).toBeCloseTo(20.63015, 5);
    // Rows 4 and 18: no optical photometry at all (r_gmag = 0).
    for (const r of [records[4]!, records[18]!]) {
      expect([r.magG, r.magR, r.magI, r.magZ].every(Number.isNaN)).toBe(true);
    }
  });

  it('derives axis ratio, PA in [0, 180) and sizes from R1/R2/PA', () => {
    // Row 9: R1 = 3.9161065, R2 = 1.2734541, PA = 6.1338158.
    const r9 = records[9]!;
    expect(r9.axisRatio).toBeCloseTo(1.2734541 / 3.9161065, 6);
    expect(r9.positionAngleDeg).toBeCloseTo(6.1338158, 6);
    expect(r9.angularMajorAxisArcsec).toBeCloseTo(7.832213, 6);
    expect(r9.diameterKpc).toBeGreaterThan(0);
    // PA wraps: 201.3 → 21.3 (row 5), -25 → 155 (row 12), -50 → 130 (row 16).
    expect(records[5]!.positionAngleDeg).toBeCloseTo(21.3000031, 5);
    expect(records[12]!.positionAngleDeg).toBeCloseTo(155, 6);
    expect(records[16]!.positionAngleDeg).toBeCloseTo(130, 6);
    // The 3″ placeholder passes through as a round 6″ source.
    expect(records[0]!.axisRatio).toBe(1);
    expect(records[0]!.angularMajorAxisArcsec).toBe(6);
  });

  it('skips truncated rows, bad positions and non-positive distances', () => {
    const row = LINES[0]!;
    expect(parseRegaladeLine(row.slice(0, 347))).toBeNull();
    expect(parseRegaladeLine(withBytes(row, 33, 42, '---'))).toBeNull();
    expect(parseRegaladeLine(withBytes(row, 55, 66, '0.000000'))).toBeNull();
    expect(parseRegalade(row + '\n' + row.slice(0, 100) + '\n').skipped).toBe(1);
  });

  it('drops the ellipse, not the row, when a semi-axis is missing', () => {
    const r = parseRegaladeLine(withBytes(LINES[9]!, 179, 191, '---'))!;
    expect(r.axisRatio).toBeNull();
    expect(r.positionAngleDeg).toBeNull();
    expect(r.diameterKpc).toBeNull();
    expect(r.angularMajorAxisArcsec).toBeUndefined();
  });
});
