import { describe, it, expect } from 'vitest';
import { formatDecSexagesimal } from '../../../src/utils/math/formatDecSexagesimal';

describe('formatDecSexagesimal', () => {
  it('formats 1.396° as +01°23\'45.6"', () => {
    // abs = 1.396; d=1°; 0.396×60=23.76' → 23'; 0.76×60=45.6"
    expect(formatDecSexagesimal(1.396)).toBe('+01°23\'45.6"');
  });

  it('formats -1.396° correctly with minus sign', () => {
    expect(formatDecSexagesimal(-1.396)).toBe('-01°23\'45.6"');
  });
});
