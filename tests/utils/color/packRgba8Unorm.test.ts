import { describe, expect, it } from 'vitest';
import { packRgba8Unorm } from '../../../src/utils/color/packRgba8Unorm';

describe('packRgba8Unorm', () => {
  it('puts red in the low byte, as unpack4x8unorm reads it', () => {
    expect(packRgba8Unorm([1, 0, 0, 0])).toBe(0x000000ff);
    expect(packRgba8Unorm([0, 0, 0, 1])).toBe(0xff000000);
  });

  it('rounds to the nearest step and clamps out-of-range channels', () => {
    expect(packRgba8Unorm([0.5, -1, 2, 0])).toBe(0x00ff0080);
  });
});
