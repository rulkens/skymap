import { describe, expect, it } from 'vitest';

import { twoFigures } from '../../../packages/website/src/utils/twoFigures';

describe('twoFigures', () => {
  it('keeps two significant figures above and below one', () => {
    expect(twoFigures(17_987_547)).toBe('18,000,000');
    expect(twoFigures(46.8)).toBe('47');
    expect(twoFigures(0.2507)).toBe('0.25');
    expect(twoFigures(0.0042)).toBe('0.0042');
  });
});
