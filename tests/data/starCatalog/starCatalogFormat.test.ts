/**
 * File-level contract tests for the star catalog on-disk format.
 *
 * These pin the load-bearing guarantees of the header + node table +
 * record-blob serialization, and nothing a compiler already checks:
 *
 *   - a synthetic catalog round-trips field-for-field (the on-disk format
 *     test — an encoder and decoder built from this module must agree,
 *     including the f64 `gridOrigin` that the precision story depends on);
 *   - a wrong magic and a stale version each fail loudly with the
 *     documented messages, so a corrupt or outdated `.bin` never
 *     mis-parses silently.
 *
 * Record-level bit-layout and quantizer tests live in
 * `starCatalogRecord.test.ts`; they are not duplicated here.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeStarCatalog,
  decodeStarCatalog,
  emptyStarCatalog,
  packStarRecord,
  VERSION,
} from '../../../src/data/starCatalog/starCatalogFormat';
import { compressStarBin, decompressStarBin } from '../../../src/data/starCatalog/starBinCodec';
import type { StarCatalog } from '../../../src/@types/data/starCatalog/StarCatalog';

/**
 * A small hand-authored catalog: one aggregate node standing in for two
 * leaves, each leaf owning a couple of packed records. The `gridOrigin`
 * is a non-axis-aligned, irrational-ish triple so the f64 round-trip is
 * exercised against real fractional bits, not zeros.
 */
function synthCatalog(): StarCatalog {
  const records = new Uint8Array([
    ...packStarRecord([12, 340, 7], 63, 31),
    ...packStarRecord([1023, 0, 512], 100, 5),
    ...packStarRecord([1, 2, 3], 0, 0),
    ...packStarRecord([777, 888, 999], 42, 21),
    // The aggregate's single flux-mip record.
    ...packStarRecord([500, 500, 500], 70, 33),
  ]);

  return {
    starCount: 4,
    nodeCount: 3,
    mortonBitsPerAxis: 9,
    cellEdgePc: 3.75,
    gridOrigin: [-123.456789012345, 987.654321098765, -0.000012345678901],
    nodes: [
      // Aggregate (level 1): one record, a 24-bit childMask exercising all
      // three composed bytes.
      { mortonIndex: 0, level: 1, childMask: 0x123456, firstRecord: 4, recordCount: 1 },
      // Two leaves (level 0, childMask 0).
      { mortonIndex: 17, level: 0, childMask: 0, firstRecord: 0, recordCount: 2 },
      { mortonIndex: 4096, level: 0, childMask: 0, firstRecord: 2, recordCount: 2 },
    ],
    records,
  };
}

describe('encodeStarCatalog / decodeStarCatalog', () => {
  it('round-trips a synthetic catalog field-for-field', async () => {
    const cat = synthCatalog();
    const decoded = await decodeStarCatalog(await encodeStarCatalog(cat));

    expect(decoded.starCount).toBe(cat.starCount);
    expect(decoded.nodeCount).toBe(cat.nodeCount);
    expect(decoded.mortonBitsPerAxis).toBe(cat.mortonBitsPerAxis);
    expect(decoded.cellEdgePc).toBe(cat.cellEdgePc);
    // f64 gridOrigin must survive bit-exact — the precision story depends on it.
    expect(decoded.gridOrigin).toEqual(cat.gridOrigin);
    expect(decoded.nodes).toEqual(cat.nodes);
    // Records byte-identical.
    expect(Array.from(decoded.records)).toEqual(Array.from(cat.records));
  });

  it('rejects a wrong magic', async () => {
    const packed = new Uint8Array(await encodeStarCatalog(synthCatalog()));
    const plain = await decompressStarBin(packed);
    plain[0] = plain[0]! ^ 0xff; // corrupt the magic post-decompress
    const recompressed = await compressStarBin(plain);
    await expect(decodeStarCatalog(recompressed.buffer as ArrayBuffer)).rejects.toThrow(
      /not a SKST file/,
    );
  });

  it('rejects a stale version with the regenerate message', async () => {
    const packed = new Uint8Array(await encodeStarCatalog(synthCatalog()));
    const plain = await decompressStarBin(packed);
    new DataView(plain.buffer, plain.byteOffset, plain.byteLength).setUint32(4, VERSION + 1, true);
    const recompressed = await compressStarBin(plain);
    await expect(decodeStarCatalog(recompressed.buffer as ArrayBuffer)).rejects.toThrow(
      /regenerate the \.bin via "npm run build-stars"/,
    );
  });

  it('encodes and decodes an empty catalog', async () => {
    const decoded = await decodeStarCatalog(await encodeStarCatalog(emptyStarCatalog()));
    expect(decoded.starCount).toBe(0);
    expect(decoded.nodeCount).toBe(0);
    expect(decoded.nodes).toEqual([]);
    expect(decoded.records.length).toBe(0);
  });

  it('rejects a truncated record region', async () => {
    // Snip one byte off the record blob so it is no longer a whole number
    // of 6-byte records; decode must fail loudly, not mis-parse the tail.
    const cat = synthCatalog();
    const packed = new Uint8Array(await encodeStarCatalog(cat));
    const plain = await decompressStarBin(packed);
    const truncated = plain.slice(0, plain.byteLength - 1);
    const recompressed = await compressStarBin(truncated);
    await expect(decodeStarCatalog(recompressed.buffer as ArrayBuffer)).rejects.toThrow(
      /truncated SKST file/,
    );
  });
});
