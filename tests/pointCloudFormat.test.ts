import { describe, it, expect } from 'vitest';
import { encodePointCloud, decodePointCloud } from '../src/data/pointCloudFormat';
import type { PointCloud } from '../src/types';

function makeCloud(): PointCloud {
  return {
    count: 2,
    positions: new Float32Array([1, 2, 3, 4, 5, 6]),
    magnitudes: new Float32Array([17.5, 18.2]),
    colorIndex: new Float32Array([0.5, 1.1]),
  };
}

describe('point cloud binary format', () => {
  it('round-trips a small cloud', () => {
    const original = makeCloud();
    const buf = encodePointCloud(original);
    const decoded = decodePointCloud(buf);
    expect(decoded.count).toBe(2);
    expect(Array.from(decoded.positions)).toEqual(Array.from(original.positions));
    expect(Array.from(decoded.magnitudes)).toEqual(Array.from(original.magnitudes));
    expect(Array.from(decoded.colorIndex)).toEqual(Array.from(original.colorIndex));
  });

  it('rejects wrong magic', () => {
    const buf = new ArrayBuffer(16);
    expect(() => decodePointCloud(buf)).toThrow(/magic/);
  });

  it('rejects unsupported version', () => {
    const original = makeCloud();
    const buf = encodePointCloud(original);
    new DataView(buf).setUint32(4, 99, true);
    expect(() => decodePointCloud(buf)).toThrow(/version/);
  });

  it('encoded byte length matches header + 5 * count * 4', () => {
    const buf = encodePointCloud(makeCloud());
    expect(buf.byteLength).toBe(16 + 2 * 5 * 4);
  });
});
