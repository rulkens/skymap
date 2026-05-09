import { describe, it, expect } from 'vitest';
import { formatDecSexagesimal } from '../../../src/utils/math/formatDecSexagesimal';

describe('formatDecSexagesimal', () => {
  it('formats 0° as +00°00\'00.0"', () => {
    expect(formatDecSexagesimal(0)).toBe('+00°00\'00.0"');
  });

  it('formats -45° as -45°00\'00.0"', () => {
    expect(formatDecSexagesimal(-45)).toBe('-45°00\'00.0"');
  });

  it('formats +90° as +90°00\'00.0"', () => {
    expect(formatDecSexagesimal(90)).toBe('+90°00\'00.0"');
  });

  it('formats 1.396° as +01°23\'45.6"', () => {
    // abs = 1.396; d=1°; 0.396×60=23.76' → 23'; 0.76×60=45.6"
    expect(formatDecSexagesimal(1.396)).toBe('+01°23\'45.6"');
  });

  it('formats -1.396° correctly with minus sign', () => {
    expect(formatDecSexagesimal(-1.396)).toBe('-01°23\'45.6"');
  });
});
