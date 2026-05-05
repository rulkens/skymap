import { describe, it, expect } from 'vitest';

import {
  parseGlade,
  parseHyperLedaCsv,
  parseGladeLine,
  parseGlade2masxPgcLine,
} from '../../tools/parsers/glade';
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
    }
    // The SDSS-shaped 64-bit `objID` slot is repurposed for GLADE rows to
    // carry the HyperLEDA PGC number when one is present.  Rows whose
    // source line had a sentinel PGC (`---`, blank, or `0`) emit `0n`.
    //   - row 0 = NGC 253, PGC 2789
    //   - row 1 = NGC 5128 (Cen A), PGC 46957
    //   - row 2 = no-name source, PGC = `---` → 0n
    expect(records[0]!.objID).toBe(2789n);
    expect(records[1]!.objID).toBe(46957n);
    expect(records[2]!.objID).toBe(0n);

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

  it('parseHyperLedaCsv parses pa + logr25 and converts to axisRatio = 10^(-logr25)', () => {
    // logr25 = log10(major/minor) in HyperLEDA; we want axisRatio = minor/major
    // = 10^(-logr25). For logr25 = 0.3: 10^-0.3 ≈ 0.501. Pinning that exact
    // conversion locks in the sign of the exponent — flipping it would silently
    // produce axisRatio > 1 (impossible for a real galaxy) and the renderer
    // would draw absurdly elongated disks pointing the wrong way.
    const csv = [
      'pgc,pa,logr25',
      '12345,30.5,0.3', // axisRatio = 10^-0.3 ≈ 0.501
      '67890,,', // queried but no match — must be absent from the map
    ].join('\n');
    const map = parseHyperLedaCsv(csv);
    expect(map.size).toBe(1);
    expect(map.get('12345')?.pa).toBe(30.5);
    expect(map.get('12345')?.axisRatio).toBeCloseTo(0.501, 3);
    expect(map.has('67890')).toBe(false);
  });

  it('applies HyperLEDA orientation to GLADE rows with matching PGC', () => {
    // The first SAMPLE row has PGC 2789 (NGC 253). Build a HyperLEDA cache
    // keyed by that PGC and verify the parsed record carries the looked-up
    // pa + axisRatio rather than null. logr25 = 0.2 → axisRatio ≈ 0.631.
    const hyperLeda = parseHyperLedaCsv(['pgc,pa,logr25', '2789,55.0,0.2'].join('\n'));
    const { records } = parseGlade(NGC253, {}, hyperLeda);
    expect(records).toHaveLength(1);
    expect(records[0]!.positionAngleDeg).toBe(55.0);
    expect(records[0]!.axisRatio).toBeCloseTo(0.631, 3);
  });

  it('returns null orientation when GLADE PGC is empty/dashes (no cross-match possible)', () => {
    // The third SAMPLE row has PGC `---` (sentinel for "no PGC assigned").
    // Even with a non-empty HyperLEDA cache, that row should not pick up an
    // orientation — the sentinel branch in parseGladeLine prevents the lookup.
    const dashRow = SAMPLE.split('\n')[2]!;
    const hyperLeda = parseHyperLedaCsv(['pgc,pa,logr25', '2789,55.0,0.2'].join('\n'));
    const { records } = parseGlade(dashRow, {}, hyperLeda);
    expect(records).toHaveLength(1);
    expect(records[0]!.positionAngleDeg).toBeNull();
    expect(records[0]!.axisRatio).toBeNull();
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

/**
 * Build a 256-byte synthetic GLADE row with selective parent-catalogue
 * names populated.  Used by the isotropic-filter tests below to exercise
 * the truth table {SDSS-only, SDSS+HyperLEDA, HyperLEDA-only} without
 * shipping additional real-row fixtures (which would shift every byte
 * offset on a single keystroke and silently break the parser).
 *
 * Byte layout (0-based half-open, must match parseGladeLine):
 *   0-7    PGC (we leave this empty — orientation lookup is irrelevant)
 *   8-36   GWGC name
 *   37-66  HyperLEDA name
 *   67-84  2MASS XSC name
 *   84-102 SDSS-DR12 name
 *   103    Flag1 ('G' = galaxy)
 *   105-123 RA (decimal degrees)
 *   124-144 Dec
 *   173-191 z
 *   192-198 Bmag
 *   253    Flag2 ('1' = z-derived distance, kept by default)
 *
 * The name fields use a placeholder string ('NAME') when populated and the
 * GLADE sentinel `---` when not, which is exactly what the live parser's
 * `nameIsPopulated` helper distinguishes.
 */
function makeFixture(opts: {
  sdssOnly?: boolean;
  sdssAndHyperleda?: boolean;
  hyperledaOnly?: boolean;
}): string {
  const NAME = 'NAME';
  const DASH = '---';
  const gwgc = DASH;
  // For sdssOnly + sdssAndHyperleda: SDSS populated; otherwise sentinel.
  const sdss = opts.sdssOnly || opts.sdssAndHyperleda ? NAME : DASH;
  // For sdssAndHyperleda + hyperledaOnly: HyperLEDA populated.
  const hyperleda = opts.sdssAndHyperleda || opts.hyperledaOnly ? NAME : DASH;
  // 2MASS XSC stays empty for all three cases (we want a clean dash there
  // so the SDSS-only filter is exercised by the SDSS column alone).
  const twomass = DASH;

  // Build the row by writing into a 256-char buffer using the verified
  // byte ranges.  Pre-fill with spaces; overlay each populated field.
  let buf = ' '.repeat(256);
  const put = (s: string, start: number, end: number): void => {
    // Truncate or pad to fit the slot exactly (`padEnd` handles short names).
    const padded = s.padEnd(end - start, ' ').slice(0, end - start);
    buf = buf.slice(0, start) + padded + buf.slice(end);
  };
  put(gwgc, 8, 36);
  put(hyperleda, 37, 66);
  put(twomass, 67, 84);
  put(sdss, 84, 102);
  // Flag1 = 'G' so the row passes the galaxy filter.
  buf = buf.slice(0, 103) + 'G' + buf.slice(104);
  // RA = 150.0 (bytes 105-123, F18.14).
  put('150.00000000000000', 105, 123);
  // Dec = 30.0 (bytes 124-144, F20.15 — note this overlaps slot width).
  put('  30.000000000000000', 124, 144);
  // z = 0.05 (bytes 173-191, E18.15).
  put('5.000000000000E-02', 173, 191);
  // Bmag = 14.0 (bytes 192-198, F6.2).
  put('14.000', 192, 198);
  // Flag2 = '1' (byte 253). Any value other than '0' passes the no-distance
  // skip; we pick '1' so the row would also survive specZOnly's catalog-name
  // check (irrelevant here, we leave specZOnly off).
  buf = buf.slice(0, 253) + '1' + buf.slice(254);
  return buf;
}

describe('parseGlade2masxPgcLine', () => {
  // The build pipeline (tools/buildAllBins.ts) runs this extractor in
  // parallel with parseGladeLine over every GLADE row, then uses the
  // resulting 2MASX→PGC map to patch PGCs into 2MRS records' objID
  // slot.  These tests pin both the byte offsets and the sentinel
  // handling so a future edit to either side stays caught at unit-
  // test time rather than silently dropping cross-match coverage in
  // production.

  it('extracts (2MASX, PGC) when both fields are populated', () => {
    // Row 0 of SAMPLE is NGC 253: PGC = 2789, 2MASX name =
    // `00473313-2517196` (verified against the catalog ReadMe).
    // Pinning the literal string here also guards against an
    // accidental ±1 byte shift in the slice range.
    const line = SAMPLE.split('\n')[0]!;
    const result = parseGlade2masxPgcLine(line);
    expect(result).not.toBeNull();
    expect(result!.pgc).toBe(2789n);
    expect(result!.massId).toBe('00473313-2517196');
  });

  it('returns null when PGC is the sentinel `---`', () => {
    // Row 2 of SAMPLE is the no-name source: PGC = `---`, 2MASX is
    // populated.  Even with a real 2MASX name, a sentinel PGC means
    // we have no useful pair to emit — the cross-match would set
    // objID = 0n, the same value 2MRS already has.
    const line = SAMPLE.split('\n')[2]!;
    expect(parseGlade2masxPgcLine(line)).toBeNull();
  });

  it('returns null when 2MASX name is the sentinel `---`', () => {
    // Construct a line where PGC is real (NGC 253's 2789) but the
    // 2MASX name slot is overwritten with 16 dashes.  Both halves of
    // the pair must be valid — without a 2MASX name there's nothing
    // for the 2MRS-side lookup to key off, so the row contributes
    // nothing to the map and we return null.
    const base = SAMPLE.split('\n')[0]!;
    const dashed = base.slice(0, 67) + '----------------' + base.slice(83);
    expect(parseGlade2masxPgcLine(dashed)).toBeNull();
  });
});

describe('GLADE isotropic filter', () => {
  it('drops a row whose only parent is SDSS-DR12', () => {
    // SDSS-DR12 column populated, GWGC + HyperLEDA + 2MASS XSC all sentinel.
    // The pencil-beam-jet row — should be filtered out.
    const line = makeFixture({ sdssOnly: true });
    expect(parseGladeLine(line, { isotropic: true })).toBeNull();
  });

  it('keeps a row that has both SDSS-DR12 and HyperLEDA names', () => {
    // SDSS populated AND HyperLEDA populated → kept (HyperLEDA is all-sky,
    // so the row contributes uniformly regardless of where SDSS pointed).
    const line = makeFixture({ sdssAndHyperleda: true });
    expect(parseGladeLine(line, { isotropic: true })).not.toBeNull();
  });

  it('keeps a row whose only parent is HyperLEDA', () => {
    // The most common GLADE row shape — kept unchanged by the filter.
    const line = makeFixture({ hyperledaOnly: true });
    expect(parseGladeLine(line, { isotropic: true })).not.toBeNull();
  });

  it('default (isotropic: false) keeps SDSS-only rows', () => {
    // The filter is opt-in; without the flag, an SDSS-only row must pass
    // through unchanged (otherwise existing builds would silently shrink).
    const line = makeFixture({ sdssOnly: true });
    expect(parseGladeLine(line, {})).not.toBeNull();
  });
});

describe('parseGladeLine diameterKpc', () => {
  it('derives diameterKpc from Bmag via Tully size-luminosity', () => {
    const pad = (s: string, w: number, left = false): string =>
      left ? s.padStart(w, ' ') : s.padEnd(w, ' ');
    let line = '';
    line += pad('1', 7);
    line += ' '.repeat(103 - line.length);
    line = line.slice(0, 103) + 'G';
    line += ' ';
    line += pad('150.00000000000000', 18, true);
    line += ' ';
    line += pad('  30.000000000000000', 20, true);
    line += ' '.repeat(173 - line.length);
    line += pad('5.000000000000E-02', 18, true);
    line += ' ';
    line += pad('14.000', 6, true);
    line += ' '.repeat(253 - line.length);
    line += '1';
    line += ' '.repeat(256 - line.length);
    expect(line.length).toBe(256);

    const rec = parseGladeLine(line);
    expect(rec).not.toBeNull();
    // Tolerance ±5 kpc — small numerical differences in distance/magnitude chain.
    expect(rec!.diameterKpc).toBeCloseTo(120, -1);
  });

  it('returns null diameterKpc when Bmag is the dash sentinel', () => {
    const pad = (s: string, w: number, left = false): string =>
      left ? s.padStart(w, ' ') : s.padEnd(w, ' ');
    let line = '';
    line += pad('1', 7);
    line += ' '.repeat(103 - line.length);
    line = line.slice(0, 103) + 'G';
    line += ' ';
    line += pad('150.00000000000000', 18, true);
    line += ' ';
    line += pad('  30.000000000000000', 20, true);
    line += ' '.repeat(173 - line.length);
    line += pad('5.000000000000E-02', 18, true);
    line += ' ';
    line += '------';
    line += ' '.repeat(253 - line.length);
    line += '1';
    line += ' '.repeat(256 - line.length);

    const rec = parseGladeLine(line);
    expect(rec).not.toBeNull();
    expect(rec!.diameterKpc).toBeNull();
  });
});
