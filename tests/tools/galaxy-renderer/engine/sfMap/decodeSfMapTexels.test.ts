/**
 * decodeSfMapTexels — pins the two interleaved strides against each other:
 * the padded row stride (bytesPerRow, WebGPU-aligned) vs the 4-lanes-per-texel
 * step within a row. A row-stride bug reads the next row's padding instead of
 * its texels, so the fixture pads each row with a distinguishable extra
 * texel that a stride mix-up would land on. Unlike decodeOrientationTexels,
 * ALL four lanes are kept (dust lives in .w).
 */
import { describe, expect, it } from 'vitest';
import { decodeSfMapTexels } from '../../../../../tools/galaxy-renderer/src/engine/sfMap/decodeSfMapTexels';
import { floatToF16 } from '../../../../../src/utils/math/floatToF16';

describe('decodeSfMapTexels', () => {
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
        const [gas, recentSf, oldActivity, dust] = texels[row]![a]!;
        const base = row * rowStrideU16 + a * 4;
        padded[base] = floatToF16(gas);
        padded[base + 1] = floatToF16(recentSf);
        padded[base + 2] = floatToF16(oldActivity);
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

    const out = decodeSfMapTexels(padded, paddedBytesPerRow, az, rings);
    expect(out.length).toBe(az * rings * 4);
    const rounded = Array.from(out).map((v) => Math.round(v * 100) / 100);
    expect(rounded).toEqual([
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1.5, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 2.5, 1.6,
    ]);
  });
});
