/**
 * formatAntiqueDegrees — ruling values arrive as k·step in floating point
 * (k · 5/60), so a minute must round, not truncate, or 10′ prints as 9′.
 */

import { describe, it, expect } from 'vitest';

import { formatAntiqueDegrees } from '../../../../src/utils/gpu/antiqueLook/formatAntiqueDegrees';

describe('formatAntiqueDegrees', () => {
  it('sets a whole degree as bare digits, even a hair off', () => {
    expect(formatAntiqueDegrees(53, false)).toBe('53');
    expect(formatAntiqueDegrees(12 * (5 / 60), true)).toBe('1');
  });

  it('sets minutes alone, or after their degree when the number must carry it', () => {
    expect(formatAntiqueDegrees(2 * (5 / 60), false)).toBe('10’');
    expect(formatAntiqueDegrees(52 + 40 / 60, false)).toBe('40’');
    expect(formatAntiqueDegrees(52 + 40 / 60, true)).toBe('52°40’');
  });
});
