/**
 * Format-level tests for the v1 cluster-catalog binary (CCAT).
 *
 * Five contracts under test:
 *
 *   1. encode → decode is a faithful round trip for all fields: positions
 *      (count*3 floats), two radius arrays, significance, and the category
 *      byte — for a two-record catalog spanning both category values (0 and 1).
 *   2. The encoded buffer has exactly the expected byte length (16 + count*28).
 *   3. A buffer with the wrong magic is rejected with an error containing
 *      'CCAT' so the caller knows which format was expected.
 *   4. A buffer with an unsupported version is rejected with a message that
 *      contains 'build-clusters' so the caller knows how to regenerate.
 *   5. emptyClusterCatalog() returns a count-0 catalog with zero-length arrays.
 *
 * Float values in round-trip tests use exactly representable f32 literals
 * (integers, powers of two, half-integers) so the Float32 truncation in
 * encode is lossless and the equality assertions are non-flaky.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeClusterCatalog,
  decodeClusterCatalog,
  emptyClusterCatalog,
} from '../../src/data/clusterCatalogFormat';
import type { ClusterCatalog } from '../../src/@types/data/ClusterCatalog';

/** Build a two-record test catalog with known field values. */
function makeCatalog(): ClusterCatalog {
  return {
    count: 2,
    // Record 0: a cluster; record 1: a supercluster
    positions: new Float32Array([
      // record 0: x, y, z
      100, -50, 25,
      // record 1: x, y, z
      -200, 75, -150,
    ]),
    physicalRadiusMpc: new Float32Array([1.5, 8]),
    apparentRadiusMpc: new Float32Array([4, 16]),
    significance: new Float32Array([5e14, 64]),
    category: new Uint8Array([0, 1]),
  };
}

describe('encode/decode cluster catalog v1 (CCAT)', () => {
  it('round-trips positions, radii, significance, and category for a 2-record catalog', () => {
    const cat = makeCatalog();
    const buf = encodeClusterCatalog(cat);
    const out = decodeClusterCatalog(buf);

    expect(out.count).toBe(2);

    // positions — 6 floats, all exactly representable as f32
    expect(Array.from(out.positions)).toEqual([100, -50, 25, -200, 75, -150]);

    // physicalRadiusMpc — 1.5 and 8 are both exactly representable as f32
    expect(Array.from(out.physicalRadiusMpc)).toEqual([1.5, 8]);

    // apparentRadiusMpc
    expect(Array.from(out.apparentRadiusMpc)).toEqual([4, 16]);

    // significance — 64 is exactly representable as f32.  5e14 is not, so
    // we compare against Math.fround(5e14) which is the value the encoder
    // actually stores (Float32 truncation is part of the contract).
    expect(out.significance[0]).toBe(Math.fround(5e14));
    expect(out.significance[1]).toBe(64);

    // category bytes
    expect(out.category[0]).toBe(0); // cluster
    expect(out.category[1]).toBe(1); // supercluster
  });

  it('encoded file size is 16 + count*28', () => {
    const buf = encodeClusterCatalog(makeCatalog());
    // 16-byte header + 2 records × 28 bytes
    expect(buf.byteLength).toBe(16 + 2 * 28);
  });

  it('encoded file size for count=0 is exactly 16 bytes', () => {
    const empty = emptyClusterCatalog();
    const buf = encodeClusterCatalog(empty);
    expect(buf.byteLength).toBe(16);
  });

  it('category byte is stored at record offset 24 (padding bytes remain zeroed)', () => {
    // Direct byte inspection so we catch a stride regression independently
    // of the decode path.
    const cat = makeCatalog();
    const buf = encodeClusterCatalog(cat);
    const bytes = new Uint8Array(buf);

    // Record 0: category=0 at header(16) + rec(0)*28 + offset(24) = 40
    expect(bytes[40]).toBe(0);
    // Padding bytes 41..43 must be zero
    expect(bytes[41]).toBe(0);
    expect(bytes[42]).toBe(0);
    expect(bytes[43]).toBe(0);

    // Record 1: category=1 at 16 + 28 + 24 = 68
    expect(bytes[68]).toBe(1);
    expect(bytes[69]).toBe(0);
    expect(bytes[70]).toBe(0);
    expect(bytes[71]).toBe(0);
  });

  it('rejects bad magic with an error containing "CCAT"', () => {
    // Write 'SKMP' magic (the galaxy-catalog magic) into an otherwise-empty buffer
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true); // 'SKMP'
    dv.setUint32(4, 1, true); // version 1
    dv.setUint32(8, 0, true); // count 0
    dv.setUint32(12, 0, true); // reserved

    expect(() => decodeClusterCatalog(buf)).toThrow(/CCAT/);
  });

  it('rejects wrong version with an error containing "build-clusters"', () => {
    // Encode a valid catalog, then patch the version field to 2
    const buf = encodeClusterCatalog(makeCatalog());
    new DataView(buf).setUint32(4, 2, true);

    expect(() => decodeClusterCatalog(buf)).toThrow(/build-clusters/);
  });

  it('encodeClusterCatalog rejects mismatched array lengths', () => {
    // count=2 but physicalRadiusMpc has only 1 element — encoder must throw.
    const bad: ClusterCatalog = {
      count: 2,
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      physicalRadiusMpc: new Float32Array([1]), // wrong: should be length 2
      apparentRadiusMpc: new Float32Array([4, 16]),
      significance: new Float32Array([5e14, 64]),
      category: new Uint8Array([0, 1]),
    };
    expect(() => encodeClusterCatalog(bad)).toThrow('physicalRadiusMpc length mismatch');
  });

  it('emptyClusterCatalog has count 0 and zero-length typed arrays', () => {
    const empty = emptyClusterCatalog();
    expect(empty.count).toBe(0);
    expect(empty.positions.length).toBe(0);
    expect(empty.physicalRadiusMpc.length).toBe(0);
    expect(empty.apparentRadiusMpc.length).toBe(0);
    expect(empty.significance.length).toBe(0);
    expect(empty.category.length).toBe(0);
  });
});
