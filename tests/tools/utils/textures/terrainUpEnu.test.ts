/**
 * The two signs and the east/north ordering are what a real bug would flip:
 * either mistake still returns a unit vector near +up, so only pinned slopes
 * catch it. The values are exact halves of a 45° plane, not eyeballed.
 */

import { describe, expect, it } from 'vitest';

import { terrainUpEnu } from '../../../../tools/utils/textures/terrainUpEnu';

const ROOT_HALF = Math.SQRT1_2;

describe('terrainUpEnu', () => {
  it('is straight up over flat ground, whatever the height', () => {
    const up = terrainUpEnu(100, 100, 100, 100, 2);
    expect(up[0]).toBeCloseTo(0, 12);
    expect(up[1]).toBeCloseTo(0, 12);
    expect(up[2]).toBe(1);
  });

  it('leans WEST when the ground rises to the east', () => {
    const up = terrainUpEnu(0, 0, 1, -1, 1);
    expect(up[0]).toBeCloseTo(-ROOT_HALF, 12);
    expect(up[1]).toBeCloseTo(0, 12);
    expect(up[2]).toBeCloseTo(ROOT_HALF, 12);
  });

  it('leans SOUTH when the ground rises to the north', () => {
    const up = terrainUpEnu(1, -1, 0, 0, 1);
    expect(up[0]).toBeCloseTo(0, 12);
    expect(up[1]).toBeCloseTo(-ROOT_HALF, 12);
    expect(up[2]).toBeCloseTo(ROOT_HALF, 12);
  });

  it('halves the gradient when the baseline doubles', () => {
    const [east, , up] = terrainUpEnu(0, 0, 1, -1, 2);
    // grad 0.5 -> normal (-0.5, 0, 1)
    const length = Math.hypot(0.5, 1);
    expect(east).toBeCloseTo(-0.5 / length, 12);
    expect(up).toBeCloseTo(1 / length, 12);
  });

  it('stays unit length on a steep slope', () => {
    const up = terrainUpEnu(40, -40, -15, 15, 1);
    expect(Math.hypot(up[0], up[1], up[2])).toBeCloseTo(1, 12);
    expect(up[2]).toBeGreaterThan(0);
  });
});
