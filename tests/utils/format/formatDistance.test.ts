import { describe, it, expect } from 'vitest';
import { formatDistance } from '../../../src/utils/format/formatDistance';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

// PC_TO_LY = 3.26156, so 1 Mpc → 3.26156 Mly, 1 kpc → 3.26156 kly, etc.
// Tests assert the string shape (parsec value / lightyear value with
// matching unit decade) rather than the precise rounded number — the
// formatScalar helper's adaptive precision is covered indirectly.

describe('formatDistance', () => {
  it('uses Mpc / Mly in the [1, 1000) range', () => {
    expect(formatDistance(1)).toBe('1.00 Mpc / 3.26 Mly');
    expect(formatDistance(100)).toBe('100 Mpc / 326 Mly');
    expect(formatDistance(542.3)).toBe('542 Mpc / 1,769 Mly');
    expect(formatDistance(999)).toBe('999 Mpc / 3,258 Mly');
  });
  it('switches to kpc / kly below 1 Mpc', () => {
    expect(formatDistance(0.5)).toBe('500 kpc / 1,631 kly');
    expect(formatDistance(0.1)).toBe('100 kpc / 326 kly');
    expect(formatDistance(0.001)).toBe('1.00 kpc / 3.26 kly');
  });
  it('switches to Gpc / Gly at and above 1000 Mpc', () => {
    expect(formatDistance(1000)).toBe('1.00 Gpc / 3.26 Gly');
    expect(formatDistance(2500)).toBe('2.50 Gpc / 8.15 Gly');
  });
  it('switches to pc / ly below 1 kpc', () => {
    // 1e-6 Mpc == 1 pc; 1 pc == 3.26156 ly.
    expect(formatDistance(1e-6)).toBe('1.00 pc / 3.26 ly');
    expect(formatDistance(1e-5)).toBe('10.0 pc / 32.6 ly');
  });
  it('switches to a bare AU value below 1 pc (solar-system scale)', () => {
    expect(formatDistance(SCALE_UNITS.AU_TO_MPC)).toBe('1.00 AU');
    expect(formatDistance(100 * SCALE_UNITS.AU_TO_MPC)).toBe('100 AU');
  });
  it('switches to a bare km value below 1 AU (planetary surface)', () => {
    expect(formatDistance(1500 * SCALE_UNITS.KM_TO_MPC)).toBe('1,500 km');
  });
  it('switches to a bare metres value below 1 km (ground level)', () => {
    expect(formatDistance(0.5 * SCALE_UNITS.KM_TO_MPC)).toBe('500 m');
    expect(formatDistance(0.999 * SCALE_UNITS.KM_TO_MPC)).toBe('999 m');
  });
  it('stays in km at exactly 1 km (boundary)', () => {
    expect(formatDistance(SCALE_UNITS.KM_TO_MPC)).toBe('1.00 km');
  });
});
