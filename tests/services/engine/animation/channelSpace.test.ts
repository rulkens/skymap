/**
 * channelSpace — unit tests for CHANNEL_SPACE and lerpInSpace.
 *
 * These tests verify that the canonical Channel→Space mapping has the right
 * entries, and that `lerpInSpace` interpolates correctly in each space.
 */

import { describe, it, expect } from 'vitest';
import { CHANNEL_SPACE, lerpInSpace } from '../../../../src/services/engine/animation/channelSpace';

describe('CHANNEL_SPACE', () => {
  it('maps distance→log, angles→add, target→lin', () => {
    expect(CHANNEL_SPACE.distance).toBe('log');
    expect(CHANNEL_SPACE.yaw).toBe('add');
    expect(CHANNEL_SPACE.pitch).toBe('add');
    expect(CHANNEL_SPACE.target).toBe('lin');
  });
});

describe('lerpInSpace', () => {
  it('log gives geometric midpoint — lerpInSpace("log", 1, 100, 0.5) ≈ 10', () => {
    // Geometric mean of 1 and 100 is sqrt(1 * 100) = 10.
    // exp(lerp(ln(1), ln(100), 0.5)) = exp((0 + ln(100)) / 2) = exp(ln(10)) = 10.
    expect(lerpInSpace('log', 1, 100, 0.5)).toBeCloseTo(10, 10);
  });

  it('log at t=0 returns the from value exactly', () => {
    expect(lerpInSpace('log', 1, 100, 0)).toBeCloseTo(1, 10);
  });

  it('log at t=1 returns the to value exactly', () => {
    expect(lerpInSpace('log', 1, 100, 1)).toBeCloseTo(100, 10);
  });

  it('add is plain lerp — lerpInSpace("add", 0, 2, 0.5) === 1', () => {
    expect(lerpInSpace('add', 0, 2, 0.5)).toBe(1);
  });

  it('add at t=0 returns from, at t=1 returns to', () => {
    expect(lerpInSpace('add', 3, 7, 0)).toBe(3);
    expect(lerpInSpace('add', 3, 7, 1)).toBe(7);
  });

  it('lin is plain lerp — same as add arithmetic', () => {
    expect(lerpInSpace('lin', 0, 2, 0.5)).toBe(1);
    expect(lerpInSpace('lin', 10, 20, 0.25)).toBeCloseTo(12.5, 10);
  });

  it('lin at t=0 returns from, at t=1 returns to', () => {
    expect(lerpInSpace('lin', -5, 5, 0)).toBe(-5);
    expect(lerpInSpace('lin', -5, 5, 1)).toBe(5);
  });
});
