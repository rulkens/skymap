/**
 * fitPlan — per-category weight + param-range tables, ported verbatim from
 * galaxy-matcher.js:141-157. These tests pin the shape of each category's
 * plan (which params it optimises, whether arms are swept) rather than every
 * literal weight, since the numeric tables themselves are transcribed 1:1
 * from the spike and any drift would be a copy-paste bug, not a design choice.
 */
import { describe, expect, it } from 'vitest';
import { fitPlan } from '../../../../tools/galaxy-renderer/src/matcher/fitPlan';

describe('fitPlan', () => {
  it('elliptical optimises only bulgeSize with zero arm weight', () => {
    const plan = fitPlan('elliptical', 0.7);
    expect(plan.w.arm).toBe(0);
    expect(plan.params).toEqual([['bulgeSize', 0.4, 1.6]]);
    expect(plan.arms).toBeNull();
  });

  it('barred appends barStrength to the spiral param set', () => {
    const spiral = fitPlan('spiral', 0.7);
    const barred = fitPlan('barred', 0.7);
    expect(barred.params).toEqual([...spiral.params, ['barStrength', 0.4, 1.6]]);
  });

  it('edge-on q disables the arm sweep', () => {
    const plan = fitPlan('spiral', 0.3);
    expect(plan.arms).toBeNull();
    expect(plan.w.arm).toBe(1);
  });

  it('face-on spiral sweeps arms 1..6', () => {
    const plan = fitPlan('spiral', 0.7);
    expect(plan.arms).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.w.arm).toBe(5);
  });

  it('lenticular and irregular also skip the arm sweep', () => {
    expect(fitPlan('lenticular', 0.9).arms).toBeNull();
    expect(fitPlan('irregular', 0.9).arms).toBeNull();
  });
});
