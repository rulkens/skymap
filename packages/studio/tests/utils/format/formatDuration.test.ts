import { describe, it, expect } from 'vitest';

import { formatDuration } from '../../../src/utils/format/formatDuration';

describe('formatDuration', () => {
  it('shows one decimal only below 10', () => {
    expect(formatDuration(4)).toBe('4 s');
    expect(formatDuration(1.5)).toBe('1.5 s');
    expect(formatDuration(11)).toBe('11 s');
    expect(formatDuration(0)).toBe('0 s');
  });
});
