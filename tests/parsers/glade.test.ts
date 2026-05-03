import { describe, it, expect } from 'vitest';

import { parseGlade } from '../../tools/parsers/glade';
import { Source } from '../../src/data/sources';

/**
 * Real first three rows of `data/raw/glade2.3.dat`, copied verbatim and
 * preserved character-for-character so trailing whitespace inside fixed-width
 * fields is never lost. GLADE is a 256-byte fixed-width ASCII format; one
 * stray edit to spacing here can shift every byte offset and silently break
 * the parser, so the rows are pinned to the published catalog.
 *
 * Why real rows instead of a synthetic minimal sample?
 *  1. The VII/281 ReadMe offsets are 1-based inclusive — an easy ±1 slip
 *     when translated to JS's 0-based half-open `String.slice`. Asserting
 *     against known galaxies (NGC 253: B = 7.34, K = 3.822, etc.) catches
 *     off-by-one byte mistakes that a hand-crafted row would not.
 *  2. Row 2 (no-name PGC = `---`) exercises the "absent name" path — every
 *     ID column blanks to `---` while the photometry is intact.
 *  3. All three rows have Flag1='G' and Flag2='3', so they should pass the
 *     skip rules; that lets us assert exactly three records out for three in.
 *
 * The last column on each row (Flag3) is followed by a newline, with no
 * trailing space — so each line is exactly 256 chars before the `\n`.
 */
const SAMPLE = [
  '   2789 NGC0253                      NGC0253                       00473313-2517196 ---                G  11.88806           -25.288799              3.92595099046     ---    0.00091602045801   7.34  0.30   ---      4.874 0.015  4.143 0.015  3.822 0.016 3 0',
  '  46957 NGC5128                      NGC5128                       13252775-4301073 ---                G 201.365646          -43.018711              3.76743399832     ---    0.00087906043953   7.48  0.30   ---      5.031 0.015  4.312 0.016  3.989 0.015 3 0',
  '    --- ---                          ---                           03464851+6805459 ---                G  56.702141           68.096107              8.3557478325      ---    0.001948          16.369 ---    ---      5.982 0.018  5.281 0.019  4.879 0.02  3 0',
].join('\n');

/**
 * Convenience: take the first GLADE row above and rewrite a single byte at
 * a 1-based offset (matching the ReadMe's 1-based byte numbering). This is
 * how we synthesise "what-if" rows — flipping Flag1='Q' to test the quasar
 * skip path, flipping Flag2='0' to test the no-distance skip path — without
 * having to hand-construct a whole 256-byte string and risk a column drift.
 */
const NGC253 = SAMPLE.split('\n')[0]!;
function withByte(line: string, oneBasedPos: number, ch: string): string {
  // Convert ReadMe's 1-based offset to 0-based JS index.
  const i = oneBasedPos - 1;
  return line.slice(0, i) + ch + line.slice(i + 1);
}

describe('parseGlade', () => {
  it('parses the real first three GLADE rows', () => {
    const { records, skipped } = parseGlade(SAMPLE);

    // All three are Flag1='G' galaxies with Flag2='3' (measured z); none
    // should be skipped. A non-zero skip count here would mean the byte
    // offsets in the parser don't line up with the catalog.
    expect(skipped).toBe(0);
    expect(records).toHaveLength(3);

    // Every record carries the GLADE source tag.
    for (const r of records) {
      expect(r.source).toBe(Source.Glade);
      // GLADE has no usable SDSS objID (its SDSS-DR12 column is a name
      // string, not a numeric ID), so the parser must always emit the
      // 0n sentinel — the merger's dedup pass relies on this.
      expect(r.objID).toBe(0n);
    }

    // ─── NGC 253 (row 0) — published values from VizieR VII/281 ─────────
    // RA/Dec come from bytes 106-123 / 125-144.
    expect(records[0]!.ra).toBeCloseTo(11.888, 2);
    expect(records[0]!.dec).toBeCloseTo(-25.289, 2);
    // z bytes 174-191 (heliocentric redshift, here ≈ 0.000916).
    expect(records[0]!.z).toBeCloseTo(0.000916, 5);
    // Heterogeneous-photometry mapping: B → magG, J → magR, H → magI,
    // K → magZ, magU stays NaN. Pinning these specific NGC 253 values
    // (B = 7.34, J = 4.874, H = 4.143, K = 3.822) is what locks the
    // mapping in place against an accidental column swap.
    expect(records[0]!.magG).toBeCloseTo(7.34, 2);
    expect(records[0]!.magR).toBeCloseTo(4.874, 3);
    expect(records[0]!.magI).toBeCloseTo(4.143, 3);
    expect(records[0]!.magZ).toBeCloseTo(3.822, 3);
    // GLADE has no u-band; magU must be NaN (not 0, not undefined).
    expect(Number.isNaN(records[0]!.magU)).toBe(true);

    // ─── NGC 5128 (Cen A, row 1) ─────────────────────────────────────────
    expect(records[1]!.ra).toBeCloseTo(201.366, 2);
    expect(records[1]!.dec).toBeCloseTo(-43.019, 2);
    expect(records[1]!.z).toBeCloseTo(0.000879, 5);

    // ─── Row 2: no-name PGC=`---` source — all ID columns are sentinel,
    // but photometry and redshift are real. The parseFloatOrNaN helper
    // is exercised here on the e_Bmag = `---` and BMAG = `---` columns.
    expect(records[2]!.ra).toBeCloseTo(56.702, 2);
    expect(records[2]!.dec).toBeCloseTo(68.096, 2);
    expect(records[2]!.z).toBeCloseTo(0.001948, 6);
    // Bmag is present (16.369) even though e_Bmag and BMAG are `---`.
    expect(records[2]!.magG).toBeCloseTo(16.369, 3);
  });

  it('skips quasars (Flag1=Q) and globular clusters (Flag1=C)', () => {
    // Take the NGC 253 row and flip Flag1 (byte 104) to 'Q' and 'C' in
    // turn. Both should be silently dropped — quasars are point-like AGN
    // (not galaxies for our purposes) and globulars are star clusters
    // inside galaxies, not separate cosmological tracers.
    const quasar = withByte(NGC253, 104, 'Q');
    const globular = withByte(NGC253, 104, 'C');
    const sample = [quasar, globular].join('\n');

    const { records, skipped } = parseGlade(sample);
    expect(records).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it('skips Flag2=0 (no measured z or distance)', () => {
    // Flag2 = '0' means GLADE could attach neither a redshift nor a
    // distance to this row — there's nothing to render. Even though the
    // z field still parses to a number on this synthetic row, the rule
    // is to skip on Flag2 alone, because Flag2 is GLADE's own quality
    // declaration. Flipping byte 254 to '0' on the NGC 253 row is the
    // simplest way to trigger this without reshuffling other columns.
    const noDist = withByte(NGC253, 254, '0');
    const { records, skipped } = parseGlade(noDist);
    expect(records).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});
