import { describe, it, expect } from 'vitest';
import { RENDER_ORIGIN_MPC } from '../../src/data/renderOrigin';

describe('RENDER_ORIGIN_MPC', () => {
  it('equals [0, 0, 0] (the Sun)', () => {
    expect(RENDER_ORIGIN_MPC).toEqual([0, 0, 0]);
  });
});
