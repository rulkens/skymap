import { describe, expect, it } from 'vitest';

import { fact } from '../../../packages/website/src/data/fact';
import { domeTurnLine } from '../../../packages/website/src/utils/domeTurnLine';

describe('domeTurnLine', () => {
  it('turns Earth once per sidereal day', () => {
    // 60 s of a 23.9345 h turn: 360 x 60 / 86,164.2 = 0.2507 degrees.
    expect(domeTurnLine(60)).toBe(
      'While this page has been open, every dome on Earth has turned 0.25 degrees under the sky. No operator was involved.',
    );
    expect(domeTurnLine(23.9345 * 3600)).toContain('turned 360 degrees');
  });

  it('says one degree in the singular', () => {
    expect(domeTurnLine(240)).toContain('turned 1 degree under');
  });

  it('uses the period its fact row prints', () => {
    expect(fact('earth-rotation').text).toContain('23.9345 hours');
  });
});
