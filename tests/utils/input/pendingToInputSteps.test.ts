import { describe, it, expect } from 'vitest';

import { pendingToInputSteps } from '../../../src/utils/input/pendingToInputSteps';
import type { PendingStep } from '../../../src/@types/input/PendingStep';
import type { InputStep } from '../../../src/@types/camera/InputStep';

const drag = (over: Partial<PendingStep & { kind: 'motion' }>): PendingStep => ({
  kind: 'motion',
  source: 'canvas',
  aspect: 1,
  intent: 'orbit',
  dx: 0,
  dy: 0,
  ratio: 1,
  at: { x: 0.5, y: 0.5 },
  held: true,
  ...over,
});

const dragOf = (step: InputStep | undefined) => {
  if (step?.kind !== 'drag') throw new Error(`expected a drag, got ${step?.kind}`);
  return step;
};

describe('pendingToInputSteps', () => {
  it("the canvas's own aspect reproduces today's pixel drag", () => {
    // 100 × 50 view: px (10, 10) → (30, 20) is dx 20/100, dy 10/50.
    const [step] = pendingToInputSteps(
      [drag({ aspect: 2, dx: 0.2, dy: 0.2, at: { x: 0.3, y: 0.4 } })],
      [100, 50],
    );
    const { startPx, endPx } = dragOf(step);
    expect(startPx[0]).toBeCloseTo(10, 9);
    expect(startPx[1]).toBeCloseTo(10, 9);
    expect(endPx[0]).toBeCloseTo(30, 9);
    expect(endPx[1]).toBeCloseTo(20, 9);
  });

  it('a 9:16 source moves isotropically on a 16:9 view', () => {
    // 0.1 of the source's height on both axes: dx = 0.1 / aspect.
    const aspect = 9 / 16;
    const [step] = pendingToInputSteps(
      [drag({ aspect, dx: 0.1 / aspect, dy: 0.1, at: { x: 0.5, y: 0.5 } })],
      [1600, 900],
    );
    const { startPx, endPx } = dragOf(step);
    expect(endPx[0] - startPx[0]).toBeCloseTo(endPx[1] - startPx[1], 9);
  });

  it('a pinch gives a zoom step with cursorPx null', () => {
    const steps = pendingToInputSteps([drag({ intent: 'zoom', ratio: 0.8, at: null })], [100, 50]);
    expect(steps).toEqual([{ kind: 'zoom', factor: 0.8, duringGesture: true, cursorPx: null }]);
  });

  it('a held: false wheel gives duringGesture false and its cursor in view pixels', () => {
    const steps = pendingToInputSteps(
      [drag({ intent: 'zoom', ratio: 1.1, held: false, at: { x: 0.25, y: 0.5 } })],
      [100, 50],
    );
    expect(steps).toEqual([
      { kind: 'zoom', factor: 1.1, duringGesture: false, cursorPx: [25, 25] },
    ]);
  });

  it("a nav motion on the canvas aspect carries today's pixels", () => {
    // 100 × 50 view, aspect 2: dx 0.2 of the width is 20 px, dy 0.2 of the height is 10 px.
    const steps = pendingToInputSteps(
      [drag({ intent: 'navLook', aspect: 2, dx: 0.1, dy: 0.2, at: null })],
      [100, 50],
    );
    expect(steps).toEqual([{ kind: 'navDrag', axis: 'look', deltaPx: [10, 10] }]);
  });

  it('a 9:16 source moves a nav drag isotropically on a 16:9 view', () => {
    // 0.1 of the source's height on both axes: dx = 0.1 / aspect.
    const aspect = 9 / 16;
    const [step] = pendingToInputSteps(
      [drag({ intent: 'navOrbit', aspect, dx: 0.1 / aspect, dy: 0.1 })],
      [1600, 900],
    );
    if (step?.kind !== 'navDrag') throw new Error('expected a navDrag');
    expect(step.deltaPx[0]).toBeCloseTo(step.deltaPx[1], 9);
    expect(step.deltaPx[1]).toBeCloseTo(90, 9);
  });

  it.each([
    ['navOrbit', 'orbit'],
    ['navLook', 'look'],
    ['navRoll', 'roll'],
    ['navZoom', 'zoom'],
  ] as const)('%s becomes the %s axis', (intent, axis) => {
    const [step] = pendingToInputSteps([drag({ intent, dx: 0.1, dy: 0.1 })], [100, 100]);
    expect(step).toMatchObject({ kind: 'navDrag', axis });
  });
});
