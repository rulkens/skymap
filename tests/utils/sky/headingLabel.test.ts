import { describe, expect, it } from 'vitest';
import { headingLabel } from '../../../src/utils/sky/headingLabel';
import { degToRad } from '../../../src/utils/math/degToRad';

describe('headingLabel', () => {
  it('reads a heading just short of north as 0°, and a look below the horizon as down', () => {
    expect(headingLabel(degToRad(359.6), degToRad(34))).toBe('0° · 34° up');
    expect(headingLabel(degToRad(180), degToRad(-5))).toBe('180° · 5° down');
  });
});
