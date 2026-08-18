/**
 * Round-trip and header-layout tests for the NumPy v1.0 .npy writer —
 * the write-side mirror of npyReader.test.ts. `writeNpy` is exercised
 * against `readNpy` itself so both ends of the contract are proven
 * together, plus a standalone header-padding assertion since that
 * requirement (64-byte-aligned data start) is invisible to `readNpy`,
 * which doesn't check it.
 */
import { describe, expect, it } from 'vitest';
import { readNpy } from '../../tools/parsers/npyReader';
import { writeNpy } from '../../tools/parsers/npyWriter';

describe('writeNpy', () => {
  it('round trips <f4 values through a non-cubic shape', () => {
    const shape = [2, 3, 4];
    const data = Float32Array.from({ length: 2 * 3 * 4 }, (_, i) => i - 12.5);
    const buf = writeNpy(data, shape, '<f4');
    const result = readNpy(buf);
    expect(result.dtype).toBe('<f4');
    expect(Array.from(result.shape)).toEqual(shape);
    expect(result.values).toBeInstanceOf(Float32Array);
    expect(Array.from(result.values as Float32Array)).toEqual(Array.from(data));
  });

  it('round trips <f2 bits', () => {
    // Raw f16 bit patterns, not decoded — mirrors how readNpy hands
    // back <f2 data (SCFD encoder's own on-disk representation).
    const shape = [5];
    const bits = Uint16Array.from([0x0000, 0x3c00, 0xbc00, 0x7bff, 0xfbff]);
    const buf = writeNpy(bits, shape, '<f2');
    const result = readNpy(buf);
    expect(result.dtype).toBe('<f2');
    expect(Array.from(result.shape)).toEqual(shape);
    expect(result.values).toBeInstanceOf(Uint16Array);
    expect(Array.from(result.values as Uint16Array)).toEqual(Array.from(bits));
  });

  it('the v1.0 header pads the data start to a 64-byte boundary', () => {
    // Hand-computed: headerDict for shape [4] dtype '<f2' is
    // "{'descr': '<f2', 'fortran_order': False, 'shape': (4,), }" (57
    // chars) + 1 trailing newline = 58, plus the 10-byte magic/version/
    // headerLen prefix = 68 unpadded. NumPy pads to the next multiple
    // of 64, i.e. 128 — so headerLen (the u16 at byte offset 8) must
    // be 118, and the data must start at byte 128.
    const buf = writeNpy(Uint16Array.from([1, 2, 3, 4]), [4], '<f2');
    const dv = new DataView(buf);
    const headerLen = dv.getUint16(8, true);
    const dataStart = 10 + headerLen;
    expect(headerLen).toBe(118);
    expect(dataStart).toBe(128);
    expect(dataStart % 64).toBe(0);
  });
});
