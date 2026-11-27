import { describe, expect, it } from 'vitest';
import { formatWeight } from '../../../../src/utils/format/formatWeight';

describe('formatWeight', () => {
  it('keeps two significant digits and drops trailing zeros', () => {
    expect([0.0415, 12.34, 1234, 2, 2e-7].map(formatWeight)).toEqual([
      '0.042',
      '12',
      '1200',
      '2',
      '2e-7',
    ]);
  });
});
