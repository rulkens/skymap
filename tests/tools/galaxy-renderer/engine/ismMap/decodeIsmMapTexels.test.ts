/**
 * decodeIsmMapTexels — pins the two interleaved strides against each other:
 * the padded row stride (bytesPerRow, WebGPU-aligned) vs the 4-lanes-per-texel
 * step within a row. A row-stride bug reads the next row's padding instead of
 * its texels, so the fixture pads each row with a distinguishable extra
 * texel that a stride mix-up would land on. Unlike decodeOrientationTexels,
 * ALL four lanes are kept (dust lives in .w).
 */
import { describe, expect, it } from 'vitest';
import { decodeIsmMapTexels } from '../../../../../tools/galaxy-renderer/src/engine/ismMap/decodeIsmMapTexels';
import { floatToF16 } from '../../../../../src/utils/math/floatToF16';
import { f16ToFloat } from '../../../../../src/utils/math/f16ToFloat';

describe('decodeIsmMapTexels', () => {
  it('reads all four lanes of each texel at the padded row stride, skipping padding', () => {
    const az = 2;
    const rings = 2;
    // 3 texels wide (1 real pair beyond `az` as row padding) so the tight
    // stride (az * 4 = 8 u16) differs from the padded stride (12 u16) used
    // here — a stride mix-up reads row 1 from row 0's padding texel.
    const texelsPerRow = 3;
    const paddedBytesPerRow = texelsPerRow * 4 * 2; // 4 lanes * 2 bytes/u16

    const rowStrideU16 = paddedBytesPerRow / 2;
    const padded = new Uint16Array(rowStrideU16 * rings);
    const texels: [number, number, number, number][][] = [
      [
        [0.1, 0.2, 0.3, 0.4],
        [0.5, 0.6, 0.7, 1.5],
      ],
      [
        [0.9, 1.0, 1.1, 1.2],
        [1.3, 1.4, 2.5, 1.6],
      ],
    ];
    for (let row = 0; row < rings; row++) {
      for (let a = 0; a < az; a++) {
        const [gas, stars, activity, dust] = texels[row]![a]!;
        const base = row * rowStrideU16 + a * 4;
        padded[base] = floatToF16(gas);
        padded[base + 1] = floatToF16(stars);
        padded[base + 2] = floatToF16(activity);
        padded[base + 3] = floatToF16(dust);
      }
      // Row-padding texel: a stride bug that used the tight (unpadded)
      // stride would read this as the next row's first texel.
      const padBase = row * rowStrideU16 + az * 4;
      padded[padBase] = floatToF16(-1);
      padded[padBase + 1] = floatToF16(-1);
      padded[padBase + 2] = floatToF16(-1);
      padded[padBase + 3] = floatToF16(-1);
    }

    const out = decodeIsmMapTexels(padded, paddedBytesPerRow, az, rings);
    expect(out.length).toBe(az * rings * 4);
    const rounded = Array.from(out).map((v) => Math.round(v * 100) / 100);
    expect(rounded).toEqual([
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1.5, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 2.5, 1.6,
    ]);
  });

  it('decodes zero, a subnormal, ±Inf and NaN exactly like the scalar f16ToFloat reference', () => {
    // 1x1 grid, unpadded — isolates the LUT decode from the row-stride
    // logic already covered above. One texel can't carry 6 special values,
    // so this walks a handful of single-texel grids instead.
    const az = 1;
    const rings = 1;
    const paddedBytesPerRow = az * 4 * 2;
    const specials: [number, number, number, number][] = [
      [0, -0, 3e-5, -3e-5], // zero (both signs) + subnormal (both signs)
      [Infinity, -Infinity, NaN, 1],
    ];
    for (const [gas, stars, activity, dust] of specials) {
      const padded = new Uint16Array(4);
      padded[0] = floatToF16(gas);
      padded[1] = floatToF16(stars);
      padded[2] = floatToF16(activity);
      padded[3] = floatToF16(dust);
      const out = decodeIsmMapTexels(padded, paddedBytesPerRow, az, rings);
      const reference = [gas, stars, activity, dust].map((v) => f16ToFloat(floatToF16(v)));
      for (let i = 0; i < 4; i++) {
        if (Number.isNaN(reference[i])) {
          expect(Number.isNaN(out[i]!)).toBe(true);
        } else {
          expect(out[i]).toBe(reference[i]);
        }
      }
    }
  });
});
