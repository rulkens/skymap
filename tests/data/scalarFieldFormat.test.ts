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

// Hoisted to module scope so all three fixture tests share the same path
// expression — avoids the duplicated join(process.cwd(), ...) smell.
const FIXTURE_PATH = join(process.cwd(), 'tests/fixtures/scalar-volume/tiny-8x8x8.scfd');

describe('SCFD v1 — baked fixture round-trip', () => {
  it('decodes the checked-in tiny-8x8x8 fixture with expected metadata', () => {
    const bytes = readFileSync(FIXTURE_PATH);
    // Convert Buffer → ArrayBuffer slice that matches its byte range.
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const decoded = decodeScalarField(ab);
    expect(decoded.dims).toEqual([8, 8, 8]);
    expect(decoded.frameKind).toBe('equatorial-cartesian');
    expect(decoded.paletteId).toBe('viridis');
    expect(decoded.origin).toEqual([-200, -200, -200]);
    expect(decoded.voxelSize).toBe(50);
    expect(decoded.rotation).toEqual([0, 0, 0, 1]);
    expect(decoded.valueMin).toBe(0);
    expect(decoded.valueMax).toBe(1);
    // Voxel pattern: index 0 → 0, index 1 → 1, ..., index 511 → 511.
    expect(decoded.voxels[0]).toBe(0);
    expect(decoded.voxels[1]).toBe(1);
    expect(decoded.voxels[511]).toBe(511);
    expect(decoded.voxels.length).toBe(512);
  });

  it('on-disk fixture has the expected total byte length', () => {
    const bytes = readFileSync(FIXTURE_PATH);
    // SCFD_HEADER_BYTES (96) + 512 voxels × 2 bytes each (f16)
    expect(bytes.byteLength).toBe(SCFD_HEADER_BYTES + 512 * 2);
  });

  it('on-disk fixture matches the documented SCFD byte layout (independent of decoder)', () => {
    // Independence check: verify specific raw bytes against the spec
    // table without going through decodeScalarField.  If encoder + decoder
    // drift together, the round-trip test would silently pass — this one
    // wouldn't, because it reads the wire bytes directly.
    const bytes = readFileSync(FIXTURE_PATH);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Magic 'SCFD' little-endian = 0x44464353 at offset 0
    expect(dv.getUint32(0, true)).toBe(0x44464353);
    // Version 1 at offset 4
    expect(dv.getUint32(4, true)).toBe(1);
    // dims = (8, 8, 8) at offsets 8, 12, 16
    expect(dv.getUint32(8, true)).toBe(8);
    expect(dv.getUint32(12, true)).toBe(8);
    expect(dv.getUint32(16, true)).toBe(8);
    // dtype = 0 (f16) at offset 20
    expect(dv.getUint8(20)).toBe(0);
    // value_kind = 0 (pre-normalised) at offset 21
    expect(dv.getUint8(21)).toBe(0);
    // palette_id = 0 (viridis) at offset 22
    expect(dv.getUint8(22)).toBe(0);
    // frame_kind = 1 (equatorial-cartesian) at offset 23
    expect(dv.getUint8(23)).toBe(1);
    // origin = (-200, -200, -200) at offsets 24, 28, 32
    expect(dv.getFloat32(24, true)).toBe(-200);
    expect(dv.getFloat32(28, true)).toBe(-200);
    expect(dv.getFloat32(32, true)).toBe(-200);
    // voxel_size = 50 at offset 36
    expect(dv.getFloat32(36, true)).toBe(50);
    // First voxel value = 0 (uint16 little-endian at offset 96)
    expect(dv.getUint16(96, true)).toBe(0);
    // Second voxel value = 1 (uint16 little-endian at offset 98)
    expect(dv.getUint16(98, true)).toBe(1);
    // Last voxel value = 511 (uint16 LE at offset 96 + 511*2 = 1118)
    expect(dv.getUint16(1118, true)).toBe(511);
  });
});
