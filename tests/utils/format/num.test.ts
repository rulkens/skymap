import { describe, it, expect } from 'vitest';
import { num } from '../../../src/utils/format/num';

// A naive `n ? String(n) : '—'` rewrite would wrongly em-dash zero; this is
// the failure mode the null/undefined checks guard against.
describe('num', () => {
  it('keeps zero as a value, not an absent-value dash', () => {
    expect(num(0)).toBe('0');
  });
  it('em-dashes null and undefined', () => {
    expect(num(null)).toBe('—');
    expect(num(undefined)).toBe('—');
  });
  it('round-trips full precision, not a rounded display form', () => {
    expect(num(0.1 + 0.2)).toBe('0.30000000000000004');
  });
});
