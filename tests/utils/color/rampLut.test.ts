import { describe, it, expect } from 'vitest';
import { rampLut } from '../../../src/utils/color/rampLut';
import type { RampAnchor } from '../../../src/@types/color/RampAnchor';

describe('rampLut', () => {
  it('produces a size×4 RGBA8 array', () => {
    const lut = rampLut(
      [
        [0, 0, 0, 0],
        [1, 255, 255, 255],
      ],
      8,
    );
    expect(lut).toBeInstanceOf(Uint8Array);
    expect(lut.length).toBe(8 * 4);
  });

  it('pins the endpoints to the first and last anchor colours', () => {
    const lut = rampLut(
      [
        [0, 10, 20, 30],
        [1, 200, 150, 100],
      ],
      16,
    );
    expect([lut[0], lut[1], lut[2]]).toEqual([10, 20, 30]);
    const last = (16 - 1) * 4;
    expect([lut[last], lut[last + 1], lut[last + 2]]).toEqual([200, 150, 100]);
  });

  it('interpolates RGB linearly at the midpoint', () => {
    const lut = rampLut(
      [
        [0, 0, 0, 0],
        [1, 100, 200, 40],
      ],
      3,
    ); // entries at t = 0, 0.5, 1.0
    const mid = 1 * 4;
    expect(lut[mid + 0]).toBe(50);
    expect(lut[mid + 1]).toBe(100);
    expect(lut[mid + 2]).toBe(20);
  });

  it('falls back to a linear alpha ramp when no anchor declares alpha', () => {
    const lut = rampLut(
      [
        [0, 0, 0, 0],
        [1, 255, 255, 255],
      ],
      3,
    );
    expect(lut[0 * 4 + 3]).toBe(0); // t=0 → alpha 0
    expect(lut[1 * 4 + 3]).toBe(128); // t=0.5 → round(0.5*255)
    expect(lut[2 * 4 + 3]).toBe(255); // t=1 → alpha 255
  });

  it('interpolates per-anchor alpha when any anchor declares it (V-shape)', () => {
    const anchors: RampAnchor[] = [
      [0, 0, 0, 255, 220],
      [0.5, 128, 128, 128, 0],
      [1, 255, 0, 0, 240],
    ];
    const lut = rampLut(anchors, 3);
    expect(lut[0 * 4 + 3]).toBe(220);
    expect(lut[1 * 4 + 3]).toBe(0); // transparent centre
    expect(lut[2 * 4 + 3]).toBe(240);
  });
});
