import { describe, it, expect } from 'vitest';

import { parseSdssCsv } from '../../tools/parsers/sdssCsv';
import { Source } from '../../src/data/sources';

/**
 * Tiny inline CSV exercising the three behaviours we care about most:
 *   - the comment-line stripper (`#Table1` is silently dropped),
 *   - the happy path (one fully-valid galaxy row → one ParsedRecord),
 *   - the skip path (a row with a missing magnitude is counted in `skipped`,
 *     not pushed into `records`).
 *
 * Building the CSV inline (rather than as a fixture file) keeps the test
 * self-contained — anyone reading the spec can see exactly what the parser
 * is supposed to accept and reject without bouncing to another file.
 */
const SAMPLE_CSV = [
  '#Table1', // comment header SkyServer prepends — must be ignored
  'objID,ra,dec,z,modelMag_u,modelMag_g,modelMag_r,modelMag_i,modelMag_z,expAB_r,expPhi_r,deVAB_r,deVPhi_r,fracDeV_r',
  // Valid galaxy: all numeric, z > 0, objID non-zero. Trailing orientation
  // columns are present but exercised in the dedicated tests below.
  '1237648720693788794,180.5,12.34,0.0512,19.21,18.05,17.40,17.10,16.92,0.5,30,0.7,30,0.5',
  // Invalid row: empty modelMag_u — should be skipped, not throw.
  '1237648720693788795,200.0,-5.0,0.10,,18.50,17.80,17.50,17.30,0.5,30,0.7,30,0.5',
].join('\n');

describe('parseSdssCsv', () => {
  it('parses the valid row, skips the invalid one, ignores comments', () => {
    const { records, skipped } = parseSdssCsv(SAMPLE_CSV);

    // One row in (the second valid by header but missing magU), one row out
    // (the first), one row skipped.
    expect(records.length).toBe(1);
    expect(skipped).toBe(1);

    const r = records[0]!;
    // Source tag must be SDSS — this is what lets the merger and the GPU
    // bitmask filter recognise where the record came from.
    expect(r.source).toBe(Source.SDSS);
    // RA/Dec/z come straight from the CSV; we use `toBeCloseTo` because
    // parseFloat → IEEE-754 doesn't always give bit-exact decimals back.
    expect(r.ra).toBeCloseTo(180.5, 6);
    expect(r.dec).toBeCloseTo(12.34, 6);
    expect(r.z).toBeCloseTo(0.0512, 6);
    // objID must survive as a 64-bit bigint — the SDSS objID is well past
    // Number.MAX_SAFE_INTEGER, so any accidental coercion would drop bits.
    expect(r.objID).toBe(1237648720693788794n);
    // All five magnitude bands populated.
    expect(r.magU).toBeCloseTo(19.21, 6);
    expect(r.magG).toBeCloseTo(18.05, 6);
    expect(r.magR).toBeCloseTo(17.4, 6);
    expect(r.magI).toBeCloseTo(17.1, 6);
    expect(r.magZ).toBeCloseTo(16.92, 6);
  });

  it('parses orientation columns and blends exp+deV via fracDeV_r', () => {
    const csv = [
      'objID,ra,dec,z,modelMag_u,modelMag_g,modelMag_r,modelMag_i,modelMag_z,expAB_r,expPhi_r,deVAB_r,deVPhi_r,fracDeV_r',
      '1237651738291,180.0,0.0,0.05,18,17,16.5,16,15.8,0.5,30,0.7,30,0.5',
    ].join('\n');
    const { records } = parseSdssCsv(csv);
    expect(records).toHaveLength(1);
    expect(records[0]!.axisRatio).toBeCloseTo(0.6, 5);
    expect(records[0]!.positionAngleDeg).toBeCloseTo(30, 5);
  });

  it('blends position angles via circular mean when they wrap across 0/180', () => {
    const csv = [
      'objID,ra,dec,z,modelMag_u,modelMag_g,modelMag_r,modelMag_i,modelMag_z,expAB_r,expPhi_r,deVAB_r,deVPhi_r,fracDeV_r',
      '1,180,0,0.05,18,17,16.5,16,15.8,0.5,5,0.5,175,0.5',
    ].join('\n');
    const { records } = parseSdssCsv(csv);
    // Circular mean of 5° and 175° on the 180°-period axis: doubled angles
    // are 10° and 350°, which average around 0° (i.e. the unit-circle
    // resultant points right). Halved → 0°, then wrapped into [0, 180) → 0°.
    // We allow a tiny float slop.
    const pa = records[0]!.positionAngleDeg!;
    // Result should be near 0 (or near 180 — both are the same orientation).
    const distFromZero = Math.min(pa, 180 - pa);
    expect(distFromZero).toBeLessThan(0.5);
  });
});
