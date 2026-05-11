/**
 * Round-trip test for the minimal NumPy v1.0 .npy reader.
 *
 * Avoids a committed binary fixture by writing a known .npy buffer
 * in-memory inside the test (using the format spec at
 * https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html).
 * The test thus exercises the reader against bytes whose every field
 * is known by construction.
 */
import { describe, expect, it } from 'vitest';
import { readNpy } from '../../tools/parsers/npyReader';

/**
 * Write a NumPy v1.0 .npy file representing a flat f32 array.
 * Returns an ArrayBuffer suitable for `readNpy`.
 *
 * Format: 6-byte magic '\x93NUMPY', 1-byte major (1), 1-byte minor (0),
 * 2-byte little-endian header_len, ASCII Python-dict header padded with
 * spaces to (10 + header_len) % 64 == 0, then raw little-endian bytes.
 */
function writeF32Npy(values: number[], shape: readonly number[]): ArrayBuffer {
  const headerDict = `{'descr': '<f4', 'fortran_order': False, 'shape': (${shape.join(', ')}${shape.length === 1 ? ',' : ''}), }`;
  // Pad header so that (10 + headerLen) is a multiple of 64.
  const baseLen = 10 + headerDict.length + 1; // +1 for trailing newline
  const padded = baseLen + ((64 - (baseLen % 64)) % 64);
  const headerLen = padded - 10;
  const headerStr = headerDict + ' '.repeat(headerLen - headerDict.length - 1) + '\n';
  const dataBytes = values.length * 4;
  const buf = new ArrayBuffer(10 + headerLen + dataBytes);
  const u8 = new Uint8Array(buf);
  // Magic + version
  u8[0] = 0x93;
  u8[1] = 0x4e; // 'N'
  u8[2] = 0x55; // 'U'
  u8[3] = 0x4d; // 'M'
  u8[4] = 0x50; // 'P'
  u8[5] = 0x59; // 'Y'
  u8[6] = 1;
  u8[7] = 0;
  // Header length (little-endian u16)
  const dv = new DataView(buf);
  dv.setUint16(8, headerLen, true);
  // Header bytes
  for (let i = 0; i < headerStr.length; i++) {
    u8[10 + i] = headerStr.charCodeAt(i);
  }
  // Data bytes
  const f32 = new Float32Array(buf, 10 + headerLen, values.length);
  f32.set(values);
  return buf;
}

describe('readNpy', () => {
  it('reads a 1-D f32 array', () => {
    const buf = writeF32Npy([1.5, -2.5, 3.5, 0], [4]);
    const result = readNpy(buf);
    expect(result.dtype).toBe('<f4');
    expect(Array.from(result.shape)).toEqual([4]);
    expect(result.values).toBeInstanceOf(Float32Array);
    expect(Array.from(result.values as Float32Array)).toEqual([1.5, -2.5, 3.5, 0]);
  });

  it('reads a 3-D f32 array (matches shape order)', () => {
    const data = Array.from({ length: 2 * 3 * 4 }, (_, i) => i + 0.5);
    const buf = writeF32Npy(data, [2, 3, 4]);
    const result = readNpy(buf);
    expect(Array.from(result.shape)).toEqual([2, 3, 4]);
    expect((result.values as Float32Array).length).toBe(24);
    expect(Array.from(result.values as Float32Array)).toEqual(data);
  });

  it('throws on bad magic', () => {
    const buf = new ArrayBuffer(16);
    expect(() => readNpy(buf)).toThrow(/magic/i);
  });

  it('throws on Fortran-order arrays (not supported)', () => {
    // Write a header with fortran_order: True
    const headerDict = `{'descr': '<f4', 'fortran_order': True, 'shape': (2, 2), }`;
    const baseLen = 10 + headerDict.length + 1;
    const padded = baseLen + ((64 - (baseLen % 64)) % 64);
    const headerLen = padded - 10;
    const headerStr = headerDict + ' '.repeat(headerLen - headerDict.length - 1) + '\n';
    const buf = new ArrayBuffer(10 + headerLen + 16);
    const u8 = new Uint8Array(buf);
    u8.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);
    new DataView(buf).setUint16(8, headerLen, true);
    for (let i = 0; i < headerStr.length; i++) u8[10 + i] = headerStr.charCodeAt(i);
    expect(() => readNpy(buf)).toThrow(/fortran/i);
  });
});
