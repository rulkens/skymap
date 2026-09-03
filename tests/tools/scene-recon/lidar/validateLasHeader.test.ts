import { describe, it, expect } from 'vitest';
import { validateLasHeader } from '../../../../tools/scene-recon/lidar/validateLasHeader';

/**
 * Builds a 227-byte LAS 1.2 public header block with only the fields
 * `validateLasHeader` reads populated — signature, offset-to-point-data
 * (96), point-record length (105), point count (107), max/min Z (211/219).
 * Every other byte is left zeroed; the function under test never reads them.
 */
function buildHeader(opts: {
  pointCount: number;
  pointDataRecordLength: number;
  offsetToPointData: number;
  minZ: number;
  maxZ: number;
  signature?: string;
}): Buffer {
  const buf = Buffer.alloc(227);
  buf.write(opts.signature ?? 'LASF', 0, 'ascii');
  buf.writeUInt32LE(opts.offsetToPointData, 96);
  buf.writeUInt16LE(opts.pointDataRecordLength, 105);
  buf.writeUInt32LE(opts.pointCount, 107);
  buf.writeDoubleLE(opts.maxZ, 211);
  buf.writeDoubleLE(opts.minZ, 219);
  return buf;
}

describe('validateLasHeader', () => {
  it('accepts a complete, plausible header whose byte math fits the file size', () => {
    const header = buildHeader({
      pointCount: 1000,
      pointDataRecordLength: 26,
      offsetToPointData: 227,
      minZ: 10,
      maxZ: 40,
    });
    const fileSize = 227 + 1000 * 26;

    const result = validateLasHeader(header, fileSize);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.header.pointCount).toBe(1000);
      expect(result.header.minZ).toBe(10);
      expect(result.header.maxZ).toBe(40);
    }
  });

  it('rejects a header buffer shorter than 227 bytes', () => {
    const result = validateLasHeader(Buffer.alloc(100), 100);
    expect(result.ok).toBe(false);
  });

  it('rejects a bad LASF signature', () => {
    const header = buildHeader({
      pointCount: 10,
      pointDataRecordLength: 26,
      offsetToPointData: 227,
      minZ: 10,
      maxZ: 40,
      signature: 'ZZZZ',
    });
    const result = validateLasHeader(header, 227 + 10 * 26);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/signature/);
  });

  it('rejects a zero point count', () => {
    const header = buildHeader({
      pointCount: 0,
      pointDataRecordLength: 26,
      offsetToPointData: 227,
      minZ: 10,
      maxZ: 40,
    });
    const result = validateLasHeader(header, 227);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/zero point count/);
  });

  it('accepts a real Punktsky tile despite wildly implausible Z bounds', () => {
    // punktsky_1km_6175_721, fetched live: header reports minz=-52.68,
    // maxz=895.9 (noise-class outlier points the header bbox doesn't
    // exclude — data/raw/dhm/README.md's documented landmine) yet the byte
    // count matches offsetToPointData + pointCount * recordLength exactly
    // (229 + 455159 * 28 = 12,744,681) — genuinely complete, not truncated.
    const header = buildHeader({
      pointCount: 455159,
      pointDataRecordLength: 28,
      offsetToPointData: 229,
      minZ: -52.68,
      maxZ: 895.9,
    });
    const result = validateLasHeader(header, 12_744_681);
    expect(result.ok).toBe(true);
  });

  it('rejects a header whose Z-bounds field is corrupt (min above max)', () => {
    const header = buildHeader({
      pointCount: 1000,
      pointDataRecordLength: 26,
      offsetToPointData: 227,
      minZ: 40,
      maxZ: 10,
    });
    const result = validateLasHeader(header, 227 + 1000 * 26);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/corrupt Z-bounds/);
  });

  it('rejects a header whose implied point-data size exceeds the actual file size', () => {
    // A download cut off mid-stream: the header (copied whole, at the
    // front of the file) still claims the full point count, but the file
    // on disk is far short of what that count implies.
    const header = buildHeader({
      pointCount: 455159,
      pointDataRecordLength: 26,
      offsetToPointData: 227,
      minZ: 10,
      maxZ: 40,
    });
    const truncatedFileSize = 1_000_000; // far short of offset + pointCount * recordLength
    const result = validateLasHeader(header, truncatedFileSize);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/truncated/);
  });
});
