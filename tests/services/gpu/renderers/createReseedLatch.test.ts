import { describe, it, expect } from 'vitest';
import { createReseedLatch } from '../../../../src/services/gpu/renderers/createReseedLatch';

describe('createReseedLatch', () => {
  it('consume returns true once after arm, then false', () => {
    const latch = createReseedLatch();
    latch.arm();
    expect(latch.consume()).toBe(true);
    // A steady frame after the reseed must NOT re-seed.
    expect(latch.consume()).toBe(false);
  });

  it('arming twice still yields a single true', () => {
    const latch = createReseedLatch();
    latch.arm();
    latch.arm();
    expect(latch.consume()).toBe(true);
    expect(latch.consume()).toBe(false);
  });

  it('a fresh latch is not armed', () => {
    const latch = createReseedLatch();
    expect(latch.consume()).toBe(false);
  });
});
