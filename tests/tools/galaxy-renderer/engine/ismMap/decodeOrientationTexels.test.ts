/**
 * decodeOrientationTexels — pins the two interleaved strides against each
 * other: the padded row stride (bytesPerRow, WebGPU-aligned) vs the
 * 4-lanes-per-texel step within a row. A row-stride bug reads the next
 * row's padding instead of its texels, so the fixture pads each row with
 * a distinguishable extra texel that a stride mix-up would land on.
 */
import { describe, expect, it } from 'vitest';
import { decodeOrientationTexels } from '../../../../../tools/galaxy-renderer/src/engine/ismMap/decodeOrientationTexels';
import { floatToF16 } from '../../../../../src/utils/math/floatToF16';

describe('decodeOrientationTexels', () => {
  it('reads .xy of each texel at the padded row stride, skipping .zw and padding', () => {
    const az = 2;
    const rings = 2;
    // 3 texels wide (1 real pair beyond `az` as row padding) so the tight
    // stride (az * 4 = 8 u16) differs from the padded stride (12 u16) used
    // here — a stride mix-up reads row 1 from row 0's padding texel.
    const texelsPerRow = 3;
    const paddedBytesPerRow = texelsPerRow * 4 * 2; // 4 lanes * 2 bytes/u16

    const rowStrideU16 = paddedBytesPerRow / 2;
    const padded = new Uint16Array(rowStrideU16 * rings);
    const pairs: [number, number][][] = [
      [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      [
        [0.5, 0.6],
        [0.7, 0.8],
      ],
    ];
    for (let row = 0; row < rings; row++) {
      for (let a = 0; a < az; a++) {
        const [cos2, sin2] = pairs[row]![a]!;
        const base = row * rowStrideU16 + a * 4;
        padded[base] = floatToF16(cos2);
        padded[base + 1] = floatToF16(sin2);
        padded[base + 2] = floatToF16(999); // .z — must never surface
        padded[base + 3] = floatToF16(999); // .w — must never surface
      }
      // Row-padding texel: a stride bug that used the tight (unpadded)
      // stride would read this as the next row's first texel.
      const padBase = row * rowStrideU16 + az * 4;
      padded[padBase] = floatToF16(-1);
      padded[padBase + 1] = floatToF16(-1);
    }

    const out = decodeOrientationTexels(padded, paddedBytesPerRow, az, rings);
    expect(out.length).toBe(az * rings * 2);
    const rounded = Array.from(out).map((v) => Math.round(v * 100) / 100);
    expect(rounded).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  });
});
