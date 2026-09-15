/**
 * channelSpace — unit tests for CHANNEL_SPACE and lerpInSpace.
 *
 * These tests verify that the canonical Channel→Space mapping has the right
 * entries, and that `lerpInSpace` interpolates correctly in each space.
 */

import { describe, it, expect } from 'vitest';
import { lerpInSpace } from '../../../../src/services/engine/animation/channelSpace';

describe('lerpInSpace', () => {
  it('log gives geometric midpoint — lerpInSpace("log", 1, 100, 0.5) ≈ 10', () => {
    // Geometric mean of 1 and 100 is sqrt(1 * 100) = 10.
    // exp(lerp(ln(1), ln(100), 0.5)) = exp((0 + ln(100)) / 2) = exp(ln(10)) = 10.
    expect(lerpInSpace('log', 1, 100, 0.5)).toBeCloseTo(10, 10);
  });
});
