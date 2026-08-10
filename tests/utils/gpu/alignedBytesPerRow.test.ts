import { describe, it, expect } from 'vitest';
import { alignedBytesPerRow } from '../../../src/utils/gpu/alignedBytesPerRow';

describe('alignedBytesPerRow', () => {
  it('leaves an already-256-aligned width unchanged', () => {
    expect(alignedBytesPerRow(3072)).toBe(3072);
  });

  it('rounds a non-aligned width up to the next multiple of 256', () => {
    expect(alignedBytesPerRow(3073)).toBe(3328);
  });
});
