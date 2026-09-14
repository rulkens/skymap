/**
 * inputAggregator — folding a frame's gesture events into ordered steps.
 *
 * The two properties the frame's drain depends on: N moves become ONE step
 * measured from the previous frame's end, and a change of kind closes the run
 * so arrival order survives (the distance a wheel tick changes is what the
 * next drag's rate is derived from).
 */

import { describe, it, expect } from 'vitest';

import { createInputAggregator } from '../../../../src/services/engine/subsystems/inputAggregator';

describe('inputAggregator', () => {
  it('collapses a frame of moves into one step, measured from the press point', () => {
    const agg = createInputAggregator();
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    for (const x of [110, 130, 165]) {
      agg.push({ kind: 'dragMove', mode: 'orbit', xPx: x, yPx: 100 });
    }

    expect(agg.drain()).toEqual([
      { kind: 'gestureStart' },
      { kind: 'drag', mode: 'orbit', startPx: [100, 100], endPx: [165, 100] },
    ]);
  });

  it('starts the next frame’s run where the last one ended, not at the press point', () => {
    const agg = createInputAggregator();
    agg.push({ kind: 'dragAnchor', xPx: 0, yPx: 0 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 10, yPx: 0 });
    agg.drain();

    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 25, yPx: 0 });

    expect(agg.drain()).toEqual([
      { kind: 'drag', mode: 'orbit', startPx: [10, 0], endPx: [25, 0] },
    ]);
  });

  it('drains empty when nothing arrived — no step applies twice', () => {
    const agg = createInputAggregator();
    agg.push({ kind: 'dragAnchor', xPx: 0, yPx: 0 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 10, yPx: 0 });

    expect(agg.drain()).toHaveLength(1);
    expect(agg.drain()).toHaveLength(0);
  });

  it('keeps a wheel tick between two drags as its own step, in order', () => {
    // Folding across the tick would apply the second drag at the pre-zoom rate.
    const agg = createInputAggregator();
    agg.push({ kind: 'dragAnchor', xPx: 0, yPx: 0 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 10, yPx: 0 });
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: true, xPx: 400, yPx: 300 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 30, yPx: 0 });

    const steps = agg.drain();
    expect(steps.map((s) => s.kind)).toEqual(['drag', 'zoom', 'drag']);
    expect(steps[2]).toEqual({ kind: 'drag', mode: 'orbit', startPx: [10, 0], endPx: [30, 0] });
  });

  it('multiplies consecutive wheel ticks into one factor', () => {
    const agg = createInputAggregator();
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 400, yPx: 300 });
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 400, yPx: 300 });

    const steps = agg.drain();
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'zoom', duringGesture: false });
    expect((steps[0] as { factor: number }).factor).toBeCloseTo(Math.exp(0.2), 10);
  });

  it('carries the wheel’s cursor pixel, keeping the last of a folded run', () => {
    // The surface arm picks its zoom anchor through this pixel, so a fold has
    // to end where the pointer ended — the same rule the drag runs use for
    // `endPx`, not the pixel the run opened at.
    const agg = createInputAggregator();
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 10, yPx: 20 });
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 30, yPx: 40 });

    const steps = agg.drain();
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'zoom', cursorPx: [30, 40] });
  });

  it('telescopes pinch samples into the first/last distance ratio', () => {
    const agg = createInputAggregator();
    agg.push({ kind: 'pinchAnchor', distPx: 100 });
    agg.push({ kind: 'pinchMove', distPx: 200 });
    agg.push({ kind: 'pinchMove', distPx: 400 });

    const steps = agg.drain();
    expect(steps).toHaveLength(1);
    // Fingers 4x apart ⇒ distance × 1/4 ⇒ zoom in.
    expect((steps[0] as { factor: number }).factor).toBeCloseTo(100 / 400, 10);
  });

  it('splits at-rest and in-gesture zoom into separate steps (different owners)', () => {
    const agg = createInputAggregator();
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 400, yPx: 300 });
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: true, xPx: 400, yPx: 300 });

    expect(agg.drain()).toHaveLength(2);
  });
});
