import { describe, expect, it } from 'vitest';
import { formatTimeLeft } from '../../src/utils/formatTimeLeft';

describe('formatTimeLeft', () => {
  it('rounds up to whole minutes and carries past the hour', () => {
    expect(formatTimeLeft(20)).toBe('under a minute');
    expect(formatTimeLeft(61)).toBe('about 2 min');
    expect(formatTimeLeft(3600)).toBe('about 1 h 0 min');
    expect(formatTimeLeft(5000)).toBe('about 1 h 24 min');
  });
});
