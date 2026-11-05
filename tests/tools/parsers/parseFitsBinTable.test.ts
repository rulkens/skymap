/**
 * parseFitsBinTable.test.ts — FITS header parsing, against a real file and
 * against hand-built malformed ones.
 *
 * The happy path runs on the checked-in upstream fixture on purpose: a
 * synthesized file would only confirm our own reading of the format. The throw
 * paths need headers a real file cannot supply, so those are built in memory.
 */
import { describe, it, expect } from 'vitest';

import { parseFitsBinTable } from '../../../tools/parsers/parseFitsBinTable';
import { concatBuffers } from '../../helpers/fits/concatBuffers';
import { fitsCard } from '../../helpers/fits/fitsCard';
import { fitsStr } from '../../helpers/fits/fitsStr';
import { loadDesiQsoFixture } from '../../helpers/fits/loadDesiQsoFixture';
import { packHeaderBlock } from '../../helpers/fits/packHeaderBlock';
import { primaryHeaderBlock } from '../../helpers/fits/primaryHeaderBlock';

/** Primary header + a BINTABLE extension whose single column has an unsupported TFORM ('C'). */
function buildUnsupportedTformBuffer(): ArrayBuffer {
  const extensionBlock = packHeaderBlock([
    fitsCard('XTENSION', fitsStr('BINTABLE')),
    fitsCard('NAXIS1', '1'),
    fitsCard('NAXIS2', '1'),
    fitsCard('TFIELDS', '1'),
    fitsCard('TTYPE1', fitsStr('FOO')),
    fitsCard('TFORM1', fitsStr('C')),
  ]);
  return concatBuffers(primaryHeaderBlock(), extensionBlock);
}

/** Primary header only, buffer ends immediately after — no second HDU at all. */
function buildNoExtensionBuffer(): ArrayBuffer {
  // Copy via concatBuffers rather than slicing `.buffer` directly:
  // primaryHeaderBlock/packHeaderBlock's bare `: Uint8Array` return
  // annotations default to `Uint8Array<ArrayBufferLike>`, so `.buffer` is
  // `ArrayBuffer | SharedArrayBuffer` (even though TextEncoder.encode()
  // itself returns `Uint8Array<ArrayBuffer>` under this repo's libs).
  // concatBuffers' `new Uint8Array(n).buffer` is a plain `ArrayBuffer`,
  // and a one-element concat is exactly the copy we want.
  return concatBuffers(primaryHeaderBlock());
}

/** A well-formed header block that is not FITS: no SIMPLE card at all. */
function buildNotFitsBuffer(): ArrayBuffer {
  return concatBuffers(packHeaderBlock([fitsCard('NAXIS', '0')]));
}

/** Valid primary header followed by a non-table extension (XTENSION = 'IMAGE'). */
function buildImageExtensionBuffer(): ArrayBuffer {
  const extensionBlock = packHeaderBlock([
    fitsCard('XTENSION', fitsStr('IMAGE')),
    fitsCard('NAXIS', '0'),
  ]);
  return concatBuffers(primaryHeaderBlock(), extensionBlock);
}

// ─── Synthesized data-row builders (for the parseDesiClustering tests) ─────

describe('parseFitsBinTable', () => {
  it('parses the QSO fixture header: rowLengthBytes 105, rowCount 6, 14 columns', () => {
    const table = parseFitsBinTable(loadDesiQsoFixture());
    expect(table.rowLengthBytes).toBe(105);
    expect(table.rowCount).toBe(6);
    expect(table.columns.length).toBe(14);
    // Primary header (1 block) + extension header (2 blocks) = 3 × 2880.
    expect(table.dataOffset).toBe(8640);
  });

  it('column byte offsets are contiguous and sum to rowLengthBytes', () => {
    const table = parseFitsBinTable(loadDesiQsoFixture());
    // Contiguity: each column starts exactly where the previous one ended.
    let expectedOffset = 0;
    for (const col of table.columns) {
      expect(col.byteOffset).toBe(expectedOffset);
      expectedOffset += col.byteLength;
    }
    const last = table.columns[table.columns.length - 1]!;
    expect(last.byteOffset + last.byteLength).toBe(table.rowLengthBytes);
  });

  it('finds RA, DEC, Z as f64 (TFORM D), TARGETID as i64 (TFORM K), PHOTSYS as 1A', () => {
    const table = parseFitsBinTable(loadDesiQsoFixture());
    const byName = new Map(table.columns.map((c) => [c.name, c]));
    expect(byName.get('RA')?.form).toBe('D');
    expect(byName.get('DEC')?.form).toBe('D');
    expect(byName.get('Z')?.form).toBe('D');
    expect(byName.get('TARGETID')?.form).toBe('K');
    expect(byName.get('PHOTSYS')?.form).toBe('1A');
  });

  it('throws naming the offending TFORM on an unsupported column type', () => {
    expect(() => parseFitsBinTable(buildUnsupportedTformBuffer())).toThrow(/TFORM "C"/);
  });

  it('throws on a buffer with no BINTABLE extension', () => {
    expect(() => parseFitsBinTable(buildNoExtensionBuffer())).toThrow();
  });

  it('throws "not a FITS file" when the primary header has no SIMPLE card', () => {
    expect(() => parseFitsBinTable(buildNotFitsBuffer())).toThrow(/not a FITS file/);
  });

  it('throws naming the wrong XTENSION when the first extension is not a BINTABLE', () => {
    expect(() => parseFitsBinTable(buildImageExtensionBuffer())).toThrow(
      /no BINTABLE extension.*XTENSION="IMAGE"/,
    );
  });
});
