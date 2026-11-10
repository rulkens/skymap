import { describe, expect, it } from 'vitest';

import { readoutText } from '../../../src/inspector/utils/readoutText';

describe('readoutText', () => {
  it("a zoom-pan's destination reads its position and distance, not custom", () => {
    expect(readoutText('to', { target: [3, 4, 0], distance: 300 })).toBe('3, 4, 0 Mpc · 300 Mpc');
  });
});
