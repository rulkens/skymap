import { describe, it, expect } from 'vitest';
import { encodePointCloud, decodePointCloud } from '../src/data/pointCloudFormat';
import type { PointCloud } from '../src/@types';

/**
 * Build a minimal 2-point v4 PointCloud for use across multiple tests.
 *
 * The two objIDs are chosen to exercise 64-bit precision: 1234567890123456789n
 * exceeds Number.MAX_SAFE_INTEGER (2^53 − 1 ≈ 9 × 10^15) so any accidental
 * conversion to `number` would silently lose the low-order bits.
 */
function makeCloud(): PointCloud {
  return {
    count: 2,
    objIDs: new BigUint64Array([1234567890123456789n, 2n]),
    positions: new Float32Array([1, 2, 3, 4, 5, 6]),
    magU: new Float32Array([19.2, 17.8]),
    magG: new Float32Array([18.5, 17.1]),
    magR: new Float32Array([17.9, 16.6]),
    magI: new Float32Array([17.6, 16.3]),
    magZ: new Float32Array([17.4, 16.1]),
    axisRatio: new Float32Array([0.42, 0.91]),
    positionAngleDeg: new Float32Array([13.5, 142.25]),
    diameterKpc: new Float32Array([30, 30]),
  };
}

describe('point cloud binary format', () => {
  it('round-trips a small cloud with all v3 fields', () => {
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

    // v3 orientation fields.
    expect(Array.from(decoded.axisRatio)).toEqual(Array.from(original.axisRatio));
    expect(Array.from(decoded.positionAngleDeg)).toEqual(
      Array.from(original.positionAngleDeg),
    );
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
    // The message must point users at the modern build pipeline so they know
    // exactly which command will produce a v3-compatible bin.
    expect(() => decodePointCloud(buf)).toThrow(/regenerate/);
    expect(() => decodePointCloud(buf)).toThrow(/build-all/);
  });

  it('encoded byte length matches 16 + count * 64', () => {
    const buf = encodePointCloud(makeCloud());
    // v4: HEADER_BYTES=16, BYTES_PER_POINT=64, count=2 → 16 + 2*64 = 144.
    expect(buf.byteLength).toBe(16 + 2 * 64);
  });
});

/**
 * v3-specific tests: orientation round-trip (finite + NaN sentinel) and
 * cross-version rejection. Kept in a separate `describe` so the original
 * round-trip suite stays focused on the existing fields.
 */
function makeOrientCloud(count: number, fillNaN = false): PointCloud {
  const ar = new Float32Array(count);
  const pa = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Fill with deterministic but distinct values so accidental swaps between
    // axisRatio and positionAngleDeg show up as test failures.
    ar[i] = fillNaN ? NaN : 0.6 + 0.01 * i;
    pa[i] = fillNaN ? NaN : 30 + i;
  }
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: ar,
    positionAngleDeg: pa,
    // diameterKpc zero-filled: these tests check axisRatio/PA round-trip only.
    diameterKpc: new Float32Array(count),
  };
}

describe('pointCloudFormat v4 (orientation round-trip)', () => {
  it('round-trips finite axisRatio and positionAngleDeg', () => {
    const cloud = makeOrientCloud(4, false);
    const decoded = decodePointCloud(encodePointCloud(cloud));
    expect(Array.from(decoded.axisRatio)).toEqual(Array.from(cloud.axisRatio));
    expect(Array.from(decoded.positionAngleDeg)).toEqual(
      Array.from(cloud.positionAngleDeg),
    );
  });

  it('round-trips NaN sentinel', () => {
    // NaN is a legitimate "no measurement" marker. The encoder must preserve
    // it bit-for-bit through the Float32Array view; toEqual won't help us
    // here because NaN !== NaN, so we test via Number.isNaN on each slot.
    const cloud = makeOrientCloud(2, true);
    const decoded = decodePointCloud(encodePointCloud(cloud));
    expect(Number.isNaN(decoded.axisRatio[0])).toBe(true);
    expect(Number.isNaN(decoded.axisRatio[1])).toBe(true);
    expect(Number.isNaN(decoded.positionAngleDeg[0])).toBe(true);
    expect(Number.isNaN(decoded.positionAngleDeg[1])).toBe(true);
  });

  it('rejects v2 with regenerate message', () => {
    // Forge a v2 header with count=0. We don't need any record bytes since
    // the version check fires before the per-point loop runs.
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, 0, true);
    expect(() => decodePointCloud(buf)).toThrow(/regenerate/);
  });

  it('rejects v1 with regenerate message', () => {
    // Same story for v1 — single error path covers all foreign versions.
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true);
    dv.setUint32(4, 1, true);
    dv.setUint32(8, 0, true);
    expect(() => decodePointCloud(buf)).toThrow(/regenerate/);
  });
});

/**
 * v4-specific tests: diameterKpc field — finite values, NaN sentinel,
 * byte-length verification, cross-version rejection (v1/v2/v3 all rejected),
 * and length-mismatch guard on encode.
 */
describe('pointCloudFormat v4', () => {
  it('round-trips diameterKpc finite values', () => {
    const cloud: PointCloud = {
      count: 2,
      objIDs: new BigUint64Array([1n, 2n]),
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      magU: new Float32Array([14, 15]),
      magG: new Float32Array([14.5, 15.5]),
      magR: new Float32Array([14.7, 15.7]),
      magI: new Float32Array([14.8, 15.8]),
      magZ: new Float32Array([14.9, 15.9]),
      axisRatio: new Float32Array([0.5, 0.8]),
      positionAngleDeg: new Float32Array([45, 90]),
      diameterKpc: new Float32Array([30, 12.5]),
    };
    const decoded = decodePointCloud(encodePointCloud(cloud));
    expect(Array.from(decoded.diameterKpc)).toEqual([30, 12.5]);
  });

  it('round-trips NaN sentinel in diameterKpc', () => {
    const cloud: PointCloud = {
      count: 1,
      objIDs: new BigUint64Array([1n]),
      positions: new Float32Array([1, 2, 3]),
      magU: new Float32Array([14]),
      magG: new Float32Array([14.5]),
      magR: new Float32Array([14.7]),
      magI: new Float32Array([14.8]),
      magZ: new Float32Array([14.9]),
      axisRatio: new Float32Array([0.5]),
      positionAngleDeg: new Float32Array([45]),
      diameterKpc: new Float32Array([NaN]),
    };
    const decoded = decodePointCloud(encodePointCloud(cloud));
    expect(Number.isNaN(decoded.diameterKpc[0])).toBe(true);
  });

  it('produces a 64-byte-per-point file (header 16 + 1 point × 64 = 80)', () => {
    const cloud: PointCloud = {
      count: 1,
      objIDs: new BigUint64Array([1n]),
      positions: new Float32Array([1, 2, 3]),
      magU: new Float32Array([14]),
      magG: new Float32Array([14.5]),
      magR: new Float32Array([14.7]),
      magI: new Float32Array([14.8]),
      magZ: new Float32Array([14.9]),
      axisRatio: new Float32Array([0.5]),
      positionAngleDeg: new Float32Array([45]),
      diameterKpc: new Float32Array([30]),
    };
    expect(encodePointCloud(cloud).byteLength).toBe(80);
  });

  it('rejects v1, v2, AND v3 with the same regenerate message', () => {
    for (const version of [1, 2, 3]) {
      const buf = new ArrayBuffer(16);
      const dv = new DataView(buf);
      dv.setUint32(0, 0x504d4b53, true);
      dv.setUint32(4, version, true);
      dv.setUint32(8, 0, true);
      dv.setUint32(12, 0, true);
      expect(() => decodePointCloud(buf)).toThrow(/regenerate/i);
    }
  });

  it('throws when diameterKpc length mismatches count', () => {
    const cloud: PointCloud = {
      count: 2,
      objIDs: new BigUint64Array([1n, 2n]),
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      magU: new Float32Array([14, 15]),
      magG: new Float32Array([14.5, 15.5]),
      magR: new Float32Array([14.7, 15.7]),
      magI: new Float32Array([14.8, 15.8]),
      magZ: new Float32Array([14.9, 15.9]),
      axisRatio: new Float32Array([0.5, 0.8]),
      positionAngleDeg: new Float32Array([45, 90]),
      diameterKpc: new Float32Array([30]),
    };
    expect(() => encodePointCloud(cloud)).toThrow(/diameterKpc length mismatch/);
  });
});
