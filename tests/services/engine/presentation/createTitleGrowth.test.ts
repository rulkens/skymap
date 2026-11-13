/**
 * createTitleGrowth — a selected name grows to the title size over a short ramp and
 * shrinks back on deselect; a reversal mid-ramp starts from where the size is, and
 * the loop is kept awake only while a ramp runs.
 */

import { describe, expect, it } from 'vitest';
import { createTitleGrowth } from '../../../../src/services/engine/presentation/createTitleGrowth';

describe('createTitleGrowth', () => {
  it('grows a newly selected name from 0 to 1 over the ramp, then settles', () => {
    const g = createTitleGrowth(200);
    expect(g.blend('a', true, 1000)).toBe(0);
    expect(g.endFrame(1000)).toBe(true);
    expect(g.blend('a', true, 1100)).toBeCloseTo(0.5);
    g.endFrame(1100);
    expect(g.blend('a', true, 1200)).toBe(1);
    expect(g.endFrame(1200)).toBe(false);
  });

  it('shrinks from where it stands when deselected mid-grow', () => {
    const g = createTitleGrowth(200);
    g.blend('a', true, 0);
    g.endFrame(0);
    const mid = g.blend('a', true, 100);
    g.endFrame(100);
    expect(g.blend('a', false, 100)).toBeCloseTo(mid);
    g.endFrame(100);
    expect(g.blend('a', false, 300)).toBe(0);
    expect(g.endFrame(300)).toBe(false);
  });

  it('leaves a name never selected at 0 and forgets one that stopped emitting', () => {
    const g = createTitleGrowth(200);
    expect(g.blend('b', false, 0)).toBe(0);
    expect(g.tracks('b')).toBe(false);
    g.blend('a', true, 0);
    g.endFrame(0);
    g.endFrame(16);
    expect(g.tracks('a')).toBe(false);
  });
});
