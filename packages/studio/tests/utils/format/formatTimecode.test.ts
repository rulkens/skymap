import { describe, it, expect } from 'vitest';

import { formatTimecode } from '../../../src/utils/format/formatTimecode';

describe('formatTimecode', () => {
  it('uses seconds below a minute and m:ss.s from a minute', () => {
    expect(formatTimecode(7.4)).toBe('7.4 s');
    expect(formatTimecode(107.5)).toBe('1:47.5');
    expect(formatTimecode(60)).toBe('1:00.0');
  });
  it('carries a rounded-up minute instead of printing 60.0 s', () => {
    expect(formatTimecode(59.96)).toBe('1:00.0');
  });
});
