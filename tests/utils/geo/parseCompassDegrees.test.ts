import { describe, it, expect } from 'vitest';

import { parseCompassDegrees } from '../../../src/utils/geo/parseCompassDegrees';

describe('parseCompassDegrees', () => {
  it('reads a bare number with no axis', () => {
    expect(parseCompassDegrees('-73.97')).toEqual({ deg: -73.97, axis: null });
  });

  it('reads a degree sign and a compass letter, negating S and W', () => {
    expect(parseCompassDegrees('55.67°N')).toEqual({ deg: 55.67, axis: 'lat' });
    expect(parseCompassDegrees('73.97w')).toEqual({ deg: -73.97, axis: 'lon' });
  });

  it('returns null for a token that is not a number', () => {
    expect(parseCompassDegrees('N')).toBeNull();
    expect(parseCompassDegrees('abc')).toBeNull();
  });
});
