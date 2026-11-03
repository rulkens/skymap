import { describe, it, expect } from 'vitest';
import { createReseedLatch } from '../../../../../src/layers/flow/streamlines/utils/createReseedLatch';

describe('createReseedLatch', () => {
  it('consume returns true once after arm, then false', () => {
    const latch = createReseedLatch();
    latch.arm();
    expect(latch.consume()).toBe(true);
    // A steady frame after the reseed must NOT re-seed.
    expect(latch.consume()).toBe(false);
  });
});
