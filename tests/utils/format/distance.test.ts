import { describe, it, expect } from 'vitest';
import { formatDistance } from '../../../src/utils/format/distance';

describe('formatDistance', () => {
  it('uses Mpc in the [1, 1000) range', () => {
    expect(formatDistance(1)).toBe('1 Mpc');
    expect(formatDistance(542.3)).toBe('542.3 Mpc');
    expect(formatDistance(999)).toBe('999 Mpc');
  });
  it('switches to kpc below 1 Mpc', () => {
    expect(formatDistance(0.5)).toBe('500 kpc');
    expect(formatDistance(0.001)).toBe('1 kpc');
  });
  it('switches to Gpc at and above 1000 Mpc', () => {
    expect(formatDistance(1000)).toBe('1 Gpc');
    expect(formatDistance(2500)).toBe('2.5 Gpc');
  });
});
