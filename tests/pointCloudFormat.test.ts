import { describe, it, expect } from 'vitest';
import { encodePointCloud, decodePointCloud } from '../src/data/pointCloudFormat';
import type { PointCloud } from '../src/types';

/**
 * Build a minimal 2-point v2 PointCloud for use across multiple tests.
 *
 * The two objIDs are chosen to exercise 64-bit precision: 1234567890123456789n
 * exceeds Number.MAX_SAFE_INTEGER (2^53 − 1 ≈ 9 × 10^15) so any accidental
 * conversion to `number` would silently lose the low-order bits.
 */
function makeCloud(): PointCloud {
  return {
    count: 2,
    objIDs:    new BigUint64Array([1234567890123456789n, 2n]),
    positions: new Float32Array([1, 2, 3, 4, 5, 6]),
    magU:      new Float32Array([19.2, 17.8]),
    magG:      new Float32Array([18.5, 17.1]),
    magR:      new Float32Array([17.9, 16.6]),
    magI:      new Float32Array([17.6, 16.3]),
    magZ:      new Float32Array([17.4, 16.1]),
  };
}

describe('point cloud binary format', () => {
  it('round-trips a small cloud with all v2 fields', () => {
    const original = makeCloud();
    const buf = encodePointCloud(original);
    const decoded = decodePointCloud(buf);

    expect(decoded.count).toBe(2);

    // Positions round-trip through Float32, so exact equality is fine.
    expect(Array.from(decoded.positions)).toEqual(Array.from(original.positions));

    // objIDs must survive as bigints with full 64-bit precision — no silent
    // coercion through Number. We compare as strings to get a readable diff.
    expect(decoded.objIDs[0]!.toString()).toBe('1234567890123456789');
    expect(decoded.objIDs[1]!.toString()).toBe('2');

    // All five magnitude bands.
    expect(Array.from(decoded.magU)).toEqual(Array.from(original.magU));
    expect(Array.from(decoded.magG)).toEqual(Array.from(original.magG));
    expect(Array.from(decoded.magR)).toEqual(Array.from(original.magR));
    expect(Array.from(decoded.magI)).toEqual(Array.from(original.magI));
    expect(Array.from(decoded.magZ)).toEqual(Array.from(original.magZ));
  });

  it('rejects wrong magic', () => {
    // An all-zero ArrayBuffer will have magic = 0 ≠ MAGIC.
    const buf = new ArrayBuffer(16);
    expect(() => decodePointCloud(buf)).toThrow(/magic/);
  });

  it('rejects unsupported version with a helpful message', () => {
    const original = makeCloud();
    const buf = encodePointCloud(original);
    // Overwrite the version field (offset 4) with an arbitrary bad value.
    new DataView(buf).setUint32(4, 99, true);
    expect(() => decodePointCloud(buf)).toThrow(/version/);
    // Also check the regeneration hint is present.
    expect(() => decodePointCloud(buf)).toThrow(/csv-to-bin/);
  });

  it('encoded byte length matches 16 + count * 48', () => {
    const buf = encodePointCloud(makeCloud());
    // v2: HEADER_BYTES=16, BYTES_PER_POINT=48, count=2 → 16 + 2*48 = 112.
    expect(buf.byteLength).toBe(16 + 2 * 48);
  });
});
