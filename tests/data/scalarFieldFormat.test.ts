import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeScalarField, decodeScalarField, SCFD_HEADER_BYTES } from '../../src/data/scalarFieldFormat';
import type { ScalarCube } from '../../src/@types/ScalarCube';

function makeFixture(): ScalarCube {
  // Tiny 2x2x2 cube — 8 voxels — for quick round-trip checks.
  const voxels = new Uint16Array(8);
  for (let i = 0; i < 8; i++) voxels[i] = i * 1000;
  return {
    dims: [2, 2, 2],
    voxels,
    frameKind: 'supergalactic-cartesian',
    origin: [-100, -100, -100],
    voxelSize: 100,
    rotation: [0, 0, 0, 1],
    paletteId: 'blue-purple',
    valueMin: 0,
    valueMax: 1,
  };
}

describe('SCFD v1 binary format', () => {
  it('round-trips a small cube byte-for-byte', () => {
    const original = makeFixture();
    const decoded = decodeScalarField(encodeScalarField(original));
    expect(decoded.dims).toEqual([2, 2, 2]);
    expect(Array.from(decoded.voxels)).toEqual(Array.from(original.voxels));
    expect(decoded.frameKind).toBe('supergalactic-cartesian');
    expect(decoded.origin).toEqual([-100, -100, -100]);
    expect(decoded.voxelSize).toBe(100);
    expect(decoded.rotation).toEqual([0, 0, 0, 1]);
    expect(decoded.paletteId).toBe('blue-purple');
  });

  it('produces the expected byte length', () => {
    // header 96 + 8 voxels × 2 bytes (f16) = 112
    const buf = encodeScalarField(makeFixture());
    expect(buf.byteLength).toBe(SCFD_HEADER_BYTES + 16);
  });

  it('rejects bad magic', () => {
    const buf = new ArrayBuffer(SCFD_HEADER_BYTES);
    expect(() => decodeScalarField(buf)).toThrow(/magic/);
  });

  it('rejects unsupported version with regenerate hint', () => {
    const buf = encodeScalarField(makeFixture());
    new DataView(buf).setUint32(4, 99, true);
    expect(() => decodeScalarField(buf)).toThrow(/version/);
    expect(() => decodeScalarField(buf)).toThrow(/regenerat/);
  });

  it('rejects unknown frameKind on decode', () => {
    const buf = encodeScalarField(makeFixture());
    new DataView(buf).setUint8(23, 99); // frame_kind byte (offset 20+3 in our header)
    expect(() => decodeScalarField(buf)).toThrow(/frameKind|frame_kind/i);
  });

  it('rejects unknown paletteId on decode', () => {
    const buf = encodeScalarField(makeFixture());
    expect(() => decodeScalarField(buf)).not.toThrow(); // baseline OK
    new DataView(buf).setUint8(22, 99);
    expect(() => decodeScalarField(buf)).toThrow(/palette/i);
  });
});

describe('SCFD v1 — baked fixture round-trip', () => {
  it('decodes the checked-in tiny-8x8x8 fixture with expected metadata', () => {
    const path = join(process.cwd(), 'tests/fixtures/scalar-volume/tiny-8x8x8.scfd');
    const bytes = readFileSync(path);
    // Convert Buffer → ArrayBuffer slice that matches its byte range.
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const decoded = decodeScalarField(ab);
    expect(decoded.dims).toEqual([8, 8, 8]);
    expect(decoded.frameKind).toBe('equatorial-cartesian');
    expect(decoded.paletteId).toBe('viridis');
    expect(decoded.origin).toEqual([-200, -200, -200]);
    expect(decoded.voxelSize).toBe(50);
    // Voxel pattern: index 0 → 0, index 1 → 1, ..., index 511 → 511.
    expect(decoded.voxels[0]).toBe(0);
    expect(decoded.voxels[1]).toBe(1);
    expect(decoded.voxels[511]).toBe(511);
    expect(decoded.voxels.length).toBe(512);
  });

  it('on-disk fixture has the expected total byte length', () => {
    const path = join(process.cwd(), 'tests/fixtures/scalar-volume/tiny-8x8x8.scfd');
    const bytes = readFileSync(path);
    expect(bytes.byteLength).toBe(96 + 512 * 2);
  });
});
