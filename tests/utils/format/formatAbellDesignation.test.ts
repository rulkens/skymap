import { describe, it, expect } from 'vitest';
import { formatAbellDesignation } from '../../../src/utils/format/formatAbellDesignation';

describe('formatAbellDesignation', () => {
  it('expands an A-prefixed Abell number to "Abell ####"', () => {
    expect(formatAbellDesignation('A1656')).toBe('Abell 1656');
  });

  it('keeps the S-prefix for ACO southern-supplement entries', () => {
    expect(formatAbellDesignation('S805')).toBe('ACO S805');
  });

  it('passes a malformed value through unchanged', () => {
    expect(formatAbellDesignation('Coma')).toBe('Coma');
  });
});
