import { describe, expect, it } from 'vitest';

import { createOrientationDiagnostics } from '../../../../../tools/galaxy-renderer/src/engine/ismMap/createOrientationDiagnostics';

const NO_READBACK = { hasData: false, generation: 0 } as const;

describe('createOrientationDiagnostics', () => {
  it('reports the mean delta per placement, not per accumulator field', () => {
    const d = createOrientationDiagnostics();
    d.noteDelta({ count: 4, sumAbsDeltaDeg: 30, maxAbsDeltaDeg: 12 });
    expect(d.report(NO_READBACK).meanDeltaDeg).toBe(7.5);
    expect(d.report(NO_READBACK).maxDeltaDeg).toBe(12);
  });

  it('reports 0 rather than NaN when no placement ran', () => {
    const d = createOrientationDiagnostics();
    d.noteDelta({ count: 0, sumAbsDeltaDeg: 0, maxAbsDeltaDeg: 0 });
    expect(d.report(NO_READBACK).meanDeltaDeg).toBe(0);
  });

  it('keeps the two producers independent — a later readback does not clear the delta pair', () => {
    const d = createOrientationDiagnostics();
    d.noteDelta({ count: 2, sumAbsDeltaDeg: 8, maxAbsDeltaDeg: 5 });
    // A 1x2 grid of packed (cos2t, sin2t): lengths 0.6 and 1.0. Float32Array
    // rounds 0.6, so the mean is compared at f32 precision, not f64.
    d.noteCoherence(new Float32Array([0.6, 0, 0, 1]));
    const r = d.report({ hasData: true, generation: 3 });
    expect(r.meanDeltaDeg).toBe(4);
    expect(r.meanCoherence).toBeCloseTo(0.8, 6);
    expect(r.maxCoherence).toBe(1);
    expect(r.generation).toBe(3);
  });
});
