import { describe, expect, it } from 'vitest';
import { multiplyWashHex } from '../../../src/utils/color/multiplyWashHex';

describe('multiplyWashHex', () => {
  it('leaves bare paper at strength 0 and multiplies the full pigment in at 1', () => {
    expect(multiplyWashHex('#f7efda', '#e6bd4d', 0)).toBe('#f7efda');
    // 0xf7 * 0xe6 / 255 = 222.8 → df; 0xef * 0xbd / 255 = 177.1 → b1; 0xda * 0x4d / 255 = 65.8 → 42
    expect(multiplyWashHex('#f7efda', '#e6bd4d', 1)).toBe('#dfb142');
  });

  it('interpolates per channel, never brightening the paper', () => {
    const half = multiplyWashHex('#f7efda', '#6b9e80', 0.5);
    expect(half).toMatch(/^#[0-9a-f]{6}$/);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(half.slice(i, i + 2), 16));
    expect(r).toBeLessThan(0xf7);
    expect(g).toBeLessThan(0xef);
    expect(b).toBeLessThan(0xda);
  });
});
