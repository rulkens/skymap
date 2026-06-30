import { describe, it, expect } from 'vitest';
import { loadFadeAlpha } from '../../../../src/utils/render/disk/loadFadeAlpha';

describe('loadFadeAlpha', () => {
  it('is 0 when not ready (undefined stamp)', () => {
    expect(loadFadeAlpha(undefined, 1000, 400)).toBe(0);
  });

  it('ramps linearly from 0 to 1 across the duration', () => {
    expect(loadFadeAlpha(1000, 1000, 400)).toBe(0);
    expect(loadFadeAlpha(1000, 1200, 400)).toBe(0.5);
    expect(loadFadeAlpha(1000, 1400, 400)).toBe(1);
  });

  it('clamps to 1 past the duration', () => {
    expect(loadFadeAlpha(1000, 99999, 400)).toBe(1);
  });
});
