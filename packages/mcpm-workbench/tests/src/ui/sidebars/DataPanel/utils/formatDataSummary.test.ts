import { describe, expect, it } from 'vitest';
import { formatDataSummary } from '../../../../../../src/ui/sidebars/DataPanel/utils/formatDataSummary';

describe('formatDataSummary', () => {
  it.each([
    [0, false, 'none'],
    [0, true, 'yours'],
    [1, false, '1 catalog'],
    [2, false, '2 catalogs'],
    [1, true, '1 catalog + yours'],
    [4, true, '4 catalogs + yours'],
  ])('%i built-ins, yours on: %s → %s', (count, yours, expected) => {
    expect(formatDataSummary(count, yours)).toBe(expected);
  });
});
