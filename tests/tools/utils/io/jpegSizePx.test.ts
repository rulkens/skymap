// Real JPEGs put APP0/DQT segments before the SOF, so the size read is a
// segment walk, not a fixed offset — and SOF shares its marker range with DHT,
// which a naive range check would stop on and mis-read.
import { describe, expect, it } from 'vitest';

import { jpegSizePx } from '../../../../tools/utils/io/jpegSizePx';

const segment = (marker: number, payload: readonly number[]) => [
  0xff,
  marker,
  (payload.length + 2) >> 8,
  (payload.length + 2) & 0xff,
  ...payload,
];

describe('jpegSizePx', () => {
  it('walks past the leading segments to the SOF', () => {
    const bytes = new Uint8Array([
      0xff,
      0xd8,
      ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
      ...segment(0xdb, new Array<number>(65).fill(0)),
      ...segment(0xc4, new Array<number>(20).fill(0)),
      ...segment(0xc0, [0x08, 0x05, 0x1e, 0x07, 0x80, 0x03, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]),
      0xff,
      0xd9,
    ]);

    expect(jpegSizePx(bytes)).toEqual([1920, 1310]);
  });

  it('rejects bytes that are not a JPEG at all', () => {
    expect(() => jpegSizePx(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow(/not a JPEG/);
  });
});
