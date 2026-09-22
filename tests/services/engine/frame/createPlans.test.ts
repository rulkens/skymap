/**
 * createPlans — the per-frame `FramePlannerResultStore`: a `get` miss throws, a `once`
 * value is view-independent, a `perView` value is keyed by view identity, and
 * the `awake`/`settling` bits OR-fold across every `put`.
 */

import { describe, it, expect } from 'vitest';

import { createPlans } from '../../../../src/services/engine/frame/createPlans';
import type { FrameContentPlanner } from '../../../../src/@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';

const oncePlanner: FrameContentPlanner<number> = {
  name: 'once-planner',
  scope: 'once',
  plan: () => ({ value: 1, awake: false, settling: false }),
};

const perViewPlanner: FrameContentPlanner<string> = {
  name: 'per-view-planner',
  scope: 'perView',
  plan: () => ({ value: 'x', awake: false, settling: false }),
};

const viewA = {} as FrameView;
const viewB = {} as FrameView;

describe('createPlans', () => {
  it('get throws for a planner never put', () => {
    const plans = createPlans();
    expect(() => plans.get(oncePlanner)).toThrow(/once-planner/);
  });

  it('get throws for a view another view planned', () => {
    const plans = createPlans();
    plans.put(perViewPlanner, viewA, { value: 'a', awake: false, settling: false });
    expect(() => plans.get(perViewPlanner, viewB)).toThrow(/per-view-planner/);
  });

  it('once value is view-independent', () => {
    const plans = createPlans();
    plans.put(oncePlanner, undefined, { value: 42, awake: false, settling: false });
    expect(plans.get(oncePlanner)).toBe(42);
    expect(plans.get(oncePlanner, viewA)).toBe(42);
  });

  it('a settling vote keeps the loop ticking too — the fold owns the implication', () => {
    const plans = createPlans();
    plans.put(oncePlanner, undefined, { value: 1, awake: false, settling: true });
    expect(plans.awake).toBe(true);
  });

  it('awake/settling OR-fold across puts', () => {
    const plans = createPlans();
    expect(plans.awake).toBe(false);
    expect(plans.settling).toBe(false);
    plans.put(oncePlanner, undefined, { value: 1, awake: true, settling: false });
    expect(plans.awake).toBe(true);
    expect(plans.settling).toBe(false);
    plans.put(perViewPlanner, viewA, { value: 'a', awake: false, settling: true });
    expect(plans.awake).toBe(true);
    expect(plans.settling).toBe(true);
  });
});
