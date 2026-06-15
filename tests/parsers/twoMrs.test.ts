import { describe, it, expect } from 'vitest';

import { parseTwoMrs, parseXscShapeCsv, type XscShapeMap } from '../../tools/parsers/twoMrs';
import { Source } from '../../src/data/sources';

/**
 * Helper for the XSC-application tests below. Builds a 233-character 2MRS
 * fixed-width line by overwriting specific (1-based, inclusive) byte
 * ranges of an all-spaces buffer.
 *
 * We construct lines programmatically rather than typing them out for two
 * reasons: (1) the byte offsets are notoriously easy to mis-count in a
 * raw string literal; (2) by sharing the same builder between the
 * "XSC-hit" and "XSC-miss" tests, we guarantee the only behavioural
 * difference between them is the map's contents — exactly what we want
 * the assertions to be sensitive to.
 *
 * The slot logic (`val.padEnd(slot).slice(0, slot)`) intentionally
 * truncates over-long values rather than throwing: the test author is
 * trusted to size each field correctly, and a silent truncation produces
 * a parse failure that's easy to debug, whereas an exception here would
 * mask the underlying intent of the test.
 */
function buildTwoMrsRow(fields: ReadonlyArray<readonly [number, number, string]>): string {
  const buf = ' '.repeat(233).split('');
  for (const [start, end, val] of fields) {
    const slot = end - start + 1;
    const padded = val.padEnd(slot).slice(0, slot);
    for (let i = 0; i < slot; i++) buf[start - 1 + i] = padded[i]!;
  }
  return buf.join('');
}

/**
 * Minimum-required fixture fields for a 2MRS row to *not* be skipped by
 * the parser: ID (used as the XSC lookup key), RA, Dec, Kcmag, Hcmag,
 * Jcmag, and cz. Everything else is left as spaces — the parser only
 * inspects these byte ranges, so leaving the rest blank exercises the
 * "minimum viable line" path that real-world short rows might exercise.
 */
const FIXTURE_ID = '12345678+0123456'; // 16 chars exactly
const FIXTURE_FIELDS: ReadonlyArray<readonly [number, number, string]> = [
  [1, 16, FIXTURE_ID],
  [18, 26, '180.00000'], // RA, F9.5
  [28, 36, '+00.00000'], // Dec, F9.5
  [58, 63, '11.500'], // Kcmag, F6.3
  [65, 70, '12.000'], // Hcmag, F6.3
  [72, 77, '12.500'], // Jcmag, F6.3
  [174, 178, ' 1000'], // cz, I5 right-aligned
];

/**
 * Real first three rows of `data/raw/2mrs_table3.dat`, copied verbatim.
 * We use real rows (not a hand-crafted minimal sample) for two reasons:
 *
 *  1. The byte offsets in the VizieR ReadMe are 1-based inclusive — easy
 *     to mis-translate by ±1 when sliced by a 0-based JS string. Asserting
 *     against published numbers for known galaxies (M31's Kcmag = 0.797
 *     etc.) catches off-by-one slicing bugs that a synthetic row wouldn't.
 *
 *  2. The first row is M31, which has cz = -300 km/s. Our local-group
 *     blueshifts are scientifically real (peculiar velocity > Hubble flow
 *     at ~700 kpc) and the rev-2 parser must keep them. Pinning that
 *     behaviour to actual M31 data makes the intent obvious in code review.
 */
const SAMPLE = [
  '00424433+4116074  10.68471  41.26875 121.17430 -21.57319  0.797  0.929  1.552  0.743  0.881  1.497 0.016 0.016 0.015 0.017 0.017 0.016 0.683 3.208 3.491 0.473 Z111  3A2s ZC  -300   4 N 1991RC3.9.C...0000d MESSIER_031',
  '00473313-2517196  11.88806 -25.28880  97.36301 -87.96452  3.815  4.132  4.858  3.765  4.077  4.798 0.016 0.015 0.015 0.017 0.016 0.016 0.019 2.799 2.965 0.264 Z111  5X_s ZC   243   2 N 2004AJ....128...16K NGC_0253',
  '09553318+6903549 148.88826  69.06526 142.09190  40.90022  3.898  4.131  4.784  3.803  4.043  4.690 0.016 0.016 0.015 0.018 0.018 0.016 0.080 2.688 2.878 0.517 Z111  2A2s ZC   -34   4 N 1991RC3.9.C...0000d MESSIER_081',
].join('\n');

const C_KM_S = 299792.458;

describe('parseTwoMrs', () => {
  it('parses the real first three 2MRS rows including local-group blueshifts', () => {
    const { records, skipped } = parseTwoMrs(SAMPLE);

    // All three rows have measured cz (-300, 243, -34); none should be skipped.
    expect(skipped).toBe(0);
    expect(records).toHaveLength(3);

    // Every record carries the 2MRS source tag — the merger needs this to
    // apply per-galaxy-catalog priority later, and it's the cheapest assertion to
    // guard against a future copy-paste bug that left, say, Source.SDSS.
    for (const r of records) {
      expect(r.source).toBe(Source.TwoMRS);
      // 2MRS has no SDSS cross-ID; all rows must use the 0n sentinel so the
      // merger's dedup pass correctly classifies them as "unmatched".
      expect(r.objID).toBe(0n);
    }

    // ─── M31 (row 0): the headline blueshift case ────────────────────────
    // RA/Dec are decimal degrees from bytes 18-26 / 28-36.
    expect(records[0]!.ra).toBeCloseTo(10.685, 2);
    expect(records[0]!.dec).toBeCloseTo(41.269, 2);
    // cz = -300 km/s → z ≈ -0.001 (negative redshift = blueshift).
    expect(records[0]!.z).toBeCloseTo(-300 / C_KM_S, 6);
    // Magnitude mapping: 2MRS Kcmag → magI, Hcmag → magR, Jcmag → magG.
    expect(records[0]!.magI).toBeCloseTo(0.797, 3); // Kcmag
    expect(records[0]!.magR).toBeCloseTo(0.929, 3); // Hcmag
    expect(records[0]!.magG).toBeCloseTo(1.552, 3); // Jcmag
    // 2MRS only has near-IR JHK; the optical u and z bands are always NaN.
    expect(records[0]!.magU).toBeNaN();
    expect(records[0]!.magZ).toBeNaN();

    // ─── NGC 253 (row 1): the canonical positive-cz sanity check ─────────
    expect(records[1]!.z).toBeCloseTo(243 / C_KM_S, 6);

    // ─── M81 (row 2): another local-group blueshift, just to be sure ─────
    expect(records[2]!.z).toBeCloseTo(-34 / C_KM_S, 6);
  });

  it('skips rows with blank cz (no measured redshift)', () => {
    // We construct a 233-byte fixed-width row by hand: the first 173 bytes
    // carry plausible numeric content (so the magnitude/coord parses all
    // succeed), bytes 174-178 are spaces (blank cz), and bytes 179-233 are
    // padded with spaces. Building it programmatically — rather than as a
    // single hand-typed literal — eliminates the chance of an off-by-one
    // typo making the cz column accidentally land somewhere else.
    // Build the first 173 chars (everything before the cz field) by
    // taking a real M31-shaped prefix and right-padding with spaces. The
    // numeric content doesn't matter for this test — only that all the
    // *other* parses succeed so the only reason for skipping is the blank
    // cz column.
    const headSeed =
      '99999999+0000000  10.00000  +5.00000   0.00000   0.00000  1.000  1.000  1.000  1.000  1.000  1.000 0.000 0.000 0.000 0.000 0.000 0.000 0.000 0.000 0.000 0.000 ';
    const head = headSeed + ' '.repeat(173 - headSeed.length);
    // Sanity-check: the cz column starts at byte 174 (index 173). If `head`
    // is exactly 173 chars, the next 5 chars in the assembled row are the
    // cz field. Asserting this here turns a silent test bug into a loud one.
    expect(head.length).toBe(173);
    const blankCz = '     '; // five spaces → trim() → '' → parseFloat → NaN → skip
    const tail = ' '.repeat(233 - 173 - 5);
    const blankCzRow = head + blankCz + tail;
    expect(blankCzRow.length).toBe(233);

    const { records, skipped } = parseTwoMrs(blankCzRow);
    expect(records).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('skips rows with cz=0 (the sentinel that maps to world origin)', () => {
    // A 2MRS row with cz=0 km/s has distance = cz / H0 = 0, which
    // collapses through `raDecZToCartesian` to the world origin
    // regardless of RA/Dec.  The renderer's runtime IAU-name formatter
    // then synthesises the displayed designation as
    // `2MASX J000000.00+000000.0` (because the inverse-transform-from-
    // origin returns ra=dec=0), which made this row look like a real
    // galaxy at the camera's home position.  Real 2MRS rows have cz
    // either positive (Hubble flow) or negative (Local Group); exact
    // zero is unphysical and indicates a placeholder.
    const sentinelRow = buildTwoMrsRow([
      [1, 16, '12345678+0123456'],
      [18, 26, '184.17549'], // arbitrary non-zero RA — what matters is cz
      [28, 36, '+69.46257'],
      [58, 63, '11.500'],
      [65, 70, '12.000'],
      [72, 77, '12.500'],
      [174, 178, '    0'],
    ]);
    expect(sentinelRow.length).toBe(233);

    const { records, skipped } = parseTwoMrs(sentinelRow);
    expect(records).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('keeps rows with negative cz (Local Group blueshifts are real)', () => {
    // The cz=0 skip rule must not over-fire — Local Group galaxies have
    // peculiar velocities of order ±300 km/s and the rev-2 parser
    // explicitly preserves them.  Confirm a small negative cz row is
    // kept (M31's actual case is covered by the SAMPLE block above;
    // this is a synthetic regression guard).
    const row = buildTwoMrsRow([
      [1, 16, '12345678+0123456'],
      [18, 26, '180.00000'],
      [28, 36, '+30.00000'],
      [58, 63, '11.500'],
      [65, 70, '12.000'],
      [72, 77, '12.500'],
      [174, 178, ' -100'],
    ]);
    expect(row.length).toBe(233);

    const { records, skipped } = parseTwoMrs(row);
    expect(records).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('applies XSC sup_ba (axisRatio) and sup_phi (positionAngleDeg) from cache', () => {
    // The map is keyed by the trimmed 2MASS designation; on a hit, the
    // parser must propagate sup_ba straight into axisRatio and sup_phi
    // straight into positionAngleDeg with no transformation. Using
    // `toBe` (rather than `toBeCloseTo`) here is intentional: any
    // arithmetic on these values would be a bug, since both fields are
    // already in the units the renderer expects.
    const line = buildTwoMrsRow(FIXTURE_FIELDS);
    const xsc: XscShapeMap = new Map([[FIXTURE_ID, { sup_phi: 45, sup_ba: 0.6 }]]);
    const { records } = parseTwoMrs(line, xsc);
    expect(records).toHaveLength(1);
    expect(records[0]!.axisRatio).toBe(0.6);
    expect(records[0]!.positionAngleDeg).toBe(45);
  });

  it('returns null axisRatio + positionAngleDeg when 2MASS ID not in XSC cache', () => {
    // Same fixture, no map: this is the "deterministic-fallback"
    // pathway. We use the single-arg form deliberately to also assert
    // that the default-empty-map signature stays valid (Task 9 hasn't
    // wired the real cache through `buildAllBins.ts` yet, so the rest
    // of the pipeline still calls `parseTwoMrs(rawText)`).
    const line = buildTwoMrsRow(FIXTURE_FIELDS);
    const { records } = parseTwoMrs(line);
    expect(records).toHaveLength(1);
    expect(records[0]!.axisRatio).toBeNull();
    expect(records[0]!.positionAngleDeg).toBeNull();
  });
});

describe('parseTwoMrs diameterKpc', () => {
  it('extracts diameterKpc from Riso for a finite cz row', () => {
    const pad = (s: string, w: number, left = false): string =>
      left ? s.padStart(w, ' ') : s.padEnd(w, ' ');

    let line = '';
    line += pad('00000000+0000000', 16);
    line += ' ';
    line += pad('150.00000', 9, true);
    line += ' ';
    line += pad(' 30.00000', 9, true);
    line += ' '.repeat(57 - line.length);
    line += pad('10.000', 6, true);
    line += ' ';
    line += pad('10.500', 6, true);
    line += ' ';
    line += pad('11.000', 6, true);
    line += ' '.repeat(141 - line.length);
    line += pad('1.176', 5);
    line += ' ';
    line += pad('1.200', 5);
    line += ' '.repeat(173 - line.length);
    line += pad(' 7000', 5, true);
    expect(line.length).toBeGreaterThanOrEqual(178);

    const { records } = parseTwoMrs(line);
    expect(records).toHaveLength(1);
    // 7000 km/s / 70 km/s/Mpc = 100 Mpc → 30" → 14.54 kpc.
    expect(records[0]!.diameterKpc).toBeCloseTo(14.54, 1);
  });

  it('returns null diameterKpc when Riso is blank', () => {
    const pad = (s: string, w: number, left = false): string =>
      left ? s.padStart(w, ' ') : s.padEnd(w, ' ');
    let line = '';
    line += pad('00000000+0000000', 16);
    line += ' ';
    line += pad('150.00000', 9, true);
    line += ' ';
    line += pad(' 30.00000', 9, true);
    line += ' '.repeat(57 - line.length);
    line += pad('10.000', 6, true);
    line += ' ';
    line += pad('10.500', 6, true);
    line += ' ';
    line += pad('11.000', 6, true);
    line += ' '.repeat(141 - line.length);
    line += '     ';
    line += ' ';
    line += '     ';
    line += ' '.repeat(173 - line.length);
    line += pad(' 7000', 5, true);

    const { records } = parseTwoMrs(line);
    expect(records).toHaveLength(1);
    expect(records[0]!.diameterKpc).toBeNull();
  });
});

describe('parseXscShapeCsv', () => {
  it('parses XSC cache CSV including empty queried-but-no-match rows', () => {
    // The cache stores one row per *queried* 2MASS ID, including IDs
    // VizieR had no XSC entry for. Those misses appear as rows with
    // empty `sup_phi`/`sup_ba` cells and must be excluded from the
    // returned map so callers can use `xsc.has(id)` as the single
    // authoritative "do we have shape data?" check.
    const csv = [
      '2massID,sup_phi,sup_ba',
      '12345678+0123456,45,0.6',
      '99999999+9999999,,', // queried but no XSC match
    ].join('\n');
    const xsc = parseXscShapeCsv(csv);
    expect(xsc.size).toBe(1);
    expect(xsc.get('12345678+0123456')).toEqual({ sup_phi: 45, sup_ba: 0.6 });
    expect(xsc.has('99999999+9999999')).toBe(false);
  });
});
