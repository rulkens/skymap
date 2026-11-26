import { describe, it, expect } from 'vitest';

import { formatNameList } from '../../../src/utils/format/formatNameList';

describe('formatNameList', () => {
  it('shows two names then +N', () => {
    expect(formatNameList(['flow'])).toBe('flow');
    expect(formatNameList(['flow', 'labels'])).toBe('flow, labels');
    expect(formatNameList(['flow', 'labels', 'galaxies', 'stars'])).toBe('flow, labels +2');
  });
});
