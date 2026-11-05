import { describe, expect, it } from 'vitest';
import { decodeSurfaceTileArchiveIndex } from '../../../../../../src/layers/body/surfaceTiles/format/utils/decodeSurfaceTileArchiveIndex';
import { findSurfaceTileArchiveEntry } from '../../../../../../src/layers/body/surfaceTiles/format/utils/findSurfaceTileArchiveEntry';
import { surfaceTileMortonKey } from '../../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileMortonKey';
import { encodeSurfaceTileArchiveIndex } from '../../../../../../tools/utils/textures/encodeSurfaceTileArchiveIndex';

const entry = (key: number) => ({ key, part: 0, offset: key * 10, length: 5 });

describe('surface tile archive index', () => {
  it('round-trips the deepest z19 key exactly', () => {
    const key = surfaceTileMortonKey(2 ** 19 - 1, 2 ** 18 - 1);
    const index = decodeSurfaceTileArchiveIndex(
      encodeSurfaceTileArchiveIndex([{ key, part: 2, offset: 4_000_000_000, length: 70_000 }], 3),
    );
    expect(findSurfaceTileArchiveEntry(index, key)).toEqual({
      key,
      part: 2,
      offset: 4_000_000_000,
      length: 70_000,
    });
  });

  it('interleaves x into even bits and y into odd bits', () => {
    expect(surfaceTileMortonKey(1, 0)).toBe(1);
    expect(surfaceTileMortonKey(0, 1)).toBe(2);
    expect(surfaceTileMortonKey(3, 5)).toBe(0b100111);
    // Past 32 bits: a truncating rewrite would still round-trip against itself.
    expect(surfaceTileMortonKey(2 ** 19 - 1, 2 ** 18 - 1)).toBe(2 ** 37 - 1);
  });

  it('returns null for a key between two entries', () => {
    const index = decodeSurfaceTileArchiveIndex(
      encodeSurfaceTileArchiveIndex([entry(4), entry(9)], 1),
    );
    expect(findSurfaceTileArchiveEntry(index, 5)).toBeNull();
    expect(findSurfaceTileArchiveEntry(index, 9)).toEqual(entry(9));
  });

  it('writes STAI v1 little-endian header', () => {
    const bytes = encodeSurfaceTileArchiveIndex([entry(1), entry(2)], 3);
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('STAI');
    expect(view.getUint16(4, true)).toBe(1);
    expect(view.getUint16(6, true)).toBe(3);
    expect(view.getUint32(8, true)).toBe(2);
    expect(bytes.byteLength).toBe(16 + 2 * 16);
  });

  it('rejects a wrong magic, an unknown version and a truncated entry table', () => {
    const good = encodeSurfaceTileArchiveIndex([entry(1), entry(2)], 1);
    const badMagic = good.slice();
    badMagic[0] = 0x58;
    const badVersion = good.slice();
    badVersion[4] = 2;
    expect(() => decodeSurfaceTileArchiveIndex(badMagic)).toThrow();
    expect(() => decodeSurfaceTileArchiveIndex(badVersion)).toThrow();
    expect(() => decodeSurfaceTileArchiveIndex(good.subarray(0, good.length - 1))).toThrow();
  });

  it('throws past the 6 B key width', () => {
    expect(() => surfaceTileMortonKey(2 ** 24, 0)).toThrow();
  });
});
