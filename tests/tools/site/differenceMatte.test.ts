import { describe, expect, it } from 'vitest';

import { differenceMatte } from '../../../tools/site/utils/differenceMatte';

// The app's white clear lands near 227 after the tone curve, not 255: the matte must not assume 255.
const WHITE = 227;
const px = (...rgb: number[]) => [...rgb, 255];
// Pixel 0 is always background, so every frame has one.
const pair = (black: number[][], white: number[][]): [Uint8Array, Uint8Array] => [
  Uint8Array.from([...px(0, 0, 0), ...black.flat()]),
  Uint8Array.from([...px(WHITE, WHITE, WHITE), ...white.flat()]),
];
const pixel = (out: Uint8Array, n: number) => Array.from(out.slice(n * 4, n * 4 + 4));

describe('differenceMatte', () => {
  it('a background pixel is fully transparent', () => {
    const [black, white] = pair([], []);
    expect(pixel(differenceMatte(black, white), 0)[3]).toBe(0);
  });

  it('an opaque pixel keeps its colour at full alpha', () => {
    const [black, white] = pair([px(200, 120, 40)], [px(200, 120, 40)]);
    expect(pixel(differenceMatte(black, white), 1)).toEqual([200, 120, 40, 255]);
  });

  it('a half-covered pixel recovers its colour and half alpha', () => {
    // 50% of (200, 100, 0) over black, and over the white ground.
    const [black, white] = pair([px(100, 50, 0)], [px(214, 164, 114)]);
    const [r = -1, g = -1, b = -1, a = -1] = pixel(differenceMatte(black, white), 1);
    // 8-bit inputs: alpha lands within a step of half, colour within a couple of steps.
    expect(Math.abs(a - 128)).toBeLessThanOrEqual(1);
    for (const [got, want] of <[number, number][]>[
      [r, 200],
      [g, 100],
      [b, 0],
    ]) {
      expect(Math.abs(got - want)).toBeLessThanOrEqual(2);
    }
  });

  it('reads the ground off the widest gap, wherever that pixel is', () => {
    const black = Uint8Array.from([...px(80, 80, 80), ...px(0, 0, 0)]);
    const white = Uint8Array.from([...px(80, 80, 80), ...px(WHITE, WHITE, WHITE)]);
    const out = differenceMatte(black, white);
    expect(pixel(out, 0)).toEqual([80, 80, 80, 255]);
    expect(pixel(out, 1)[3]).toBe(0);
  });

  it('refuses a frame the subject fills', () => {
    const solid = Uint8Array.from(px(90, 90, 90));
    expect(() => differenceMatte(solid, solid)).toThrow(/no background/);
  });
});
