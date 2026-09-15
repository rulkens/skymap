import { describe, it, expect } from 'vitest';
import { wrapLabelName } from '../../../src/utils/format/wrapLabelName';

describe('wrapLabelName', () => {
  it('leaves short names on one line', () => {
    expect(wrapLabelName('Virgo Cluster')).toBe('Virgo Cluster');
    expect(wrapLabelName('Coma Supercluster')).toBe('Coma Supercluster'); // 17 ≤ 18
  });

  it('picks the space that balances the two lines', () => {
    // Spaces after 'Corona' (6) and 'Borealis' (15); the second gives
    // 15/12 chars vs 6/21 — far closer to even.
    expect(wrapLabelName('Corona Borealis Supercluster')).toBe('Corona Borealis\nSupercluster');
  });

  it('never wraps a long name with no space', () => {
    expect(wrapLabelName('Perseus-Pisces-Supercluster')).toBe('Perseus-Pisces-Supercluster');
  });
});
