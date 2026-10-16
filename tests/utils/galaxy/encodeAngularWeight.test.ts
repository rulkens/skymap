import { describe, it, expect } from 'vitest';

import { decodeAngularWeight } from '../../../src/utils/galaxy/decodeAngularWeight';
import { encodeAngularWeight } from '../../../src/utils/galaxy/encodeAngularWeight';

describe('encodeAngularWeight / decodeAngularWeight', () => {
  it('1.0 encodes to exactly 128 and decodes back to exactly 1', () => {
    expect(encodeAngularWeight(1)).toBe(128);
    expect(decodeAngularWeight(128)).toBe(1);
  });

  it('0.1 → 1, 10 → 255, and values outside clamp to those', () => {
    expect(encodeAngularWeight(0.1)).toBe(1);
    expect(encodeAngularWeight(10)).toBe(255);
    expect(encodeAngularWeight(0.01)).toBe(1);
    expect(encodeAngularWeight(0)).toBe(1);
    expect(encodeAngularWeight(100)).toBe(255);
  });

  it('raw 0 decodes to 1', () => {
    expect(decodeAngularWeight(0)).toBe(1);
  });

  it('encode is monotone over [0.1, 10]', () => {
    let prev = 0;
    for (let i = 0; i <= 1000; i++) {
      const raw = encodeAngularWeight(10 ** (-1 + (2 * i) / 1000));
      expect(raw).toBeGreaterThanOrEqual(prev);
      prev = raw;
    }
    expect(prev).toBe(255);
  });
});
