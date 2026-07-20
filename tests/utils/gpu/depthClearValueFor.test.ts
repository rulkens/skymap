import { describe, it, expect } from 'vitest';
import { depthClearValueFor } from '../../../src/utils/gpu/depthClearValueFor';

describe('depthClearValueFor', () => {
  it('returns 1 for non-reversed and 0 for reversed depth', () => {
    expect(depthClearValueFor(false)).toBe(1);
    expect(depthClearValueFor(true)).toBe(0);
  });
});
