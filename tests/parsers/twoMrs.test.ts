import { describe, it, expect } from 'vitest';

import { parseTwoMrs } from '../../tools/parsers/twoMrs';
import { Source } from '../../src/data/sources';

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
    // apply per-survey priority later, and it's the cheapest assertion to
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
});
