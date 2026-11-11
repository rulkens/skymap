import { describe, expect, it } from 'vitest';
import { formatPosition } from '../../../src/utils/format/formatPosition';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';

describe('formatPosition', () => {
  it('reads a solar-system position in AU, not as zero Mpc', () => {
    const au = SCALE_UNITS.AU_TO_MPC;
    expect(formatPosition([1.2 * au, -0.6 * au, 0.3 * au])).toBe('1.2, −0.6, 0.3 AU');
  });
});
