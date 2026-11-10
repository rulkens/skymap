import { describe, expect, it } from 'vitest';

import { readoutText } from '../../../src/inspector/utils/readoutText';

describe('readoutText', () => {
  it("a zoom-pan's destination reads its position and distance, not custom", () => {
    expect(readoutText('to', { target: [3, 4, 0], distance: 300 })).toBe('3, 4, 0 Mpc · 300 Mpc');
  });

  it("a zoom-pan's FOV reads in degrees, a per-join Blend in seconds", () => {
    expect(readoutText('fovYRad', Math.PI / 3)).toBe('60°');
    expect(readoutText('overlap', [1, 2])).toBe('1 s, 2 s');
  });
});
