import { describe, expect, it } from 'vitest';

import { emphasisSegments } from '../../../src/utils/text/emphasisSegments';

describe('emphasisSegments', () => {
  it('returns copy without markup as a single plain segment', () => {
    expect(emphasisSegments('no markup here')).toEqual(['no markup here']);
  });

  // The odd/even parity is the whole contract: a caller emphasises odd indices,
  // so a span at the very start must still leave an empty plain segment first.
  it('puts an emphasised span at an odd index wherever it sits', () => {
    expect(emphasisSegments('a slime mould, <i>Physarum polycephalum</i>, which grows')).toEqual([
      'a slime mould, ',
      'Physarum polycephalum',
      ', which grows',
    ]);
    expect(emphasisSegments('<i>Physarum</i> grows')).toEqual(['', 'Physarum', ' grows']);
  });

  it('leaves other tags as literal text', () => {
    expect(emphasisSegments('a <b>bold</b> claim')).toEqual(['a <b>bold</b> claim']);
  });
});
