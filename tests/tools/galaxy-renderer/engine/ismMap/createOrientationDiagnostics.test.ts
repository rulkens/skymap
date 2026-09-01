import { describe, expect, it } from 'vitest';

import { createOrientationDiagnostics } from '../../../../../tools/galaxy-renderer/src/engine/ismMap/createOrientationDiagnostics';

const NO_READBACK = { hasData: false, generation: 0 } as const;

describe('createOrientationDiagnostics', () => {
  it('reports coherence mean/max from a landed orientation grid, at f32 precision', () => {
    const d = createOrientationDiagnostics();
    // A 1x2 grid of packed (cos2t, sin2t): lengths 0.6 and 1.0. Float32Array
    // rounds 0.6, so the mean is compared at f32 precision, not f64.
    d.noteCoherence(new Float32Array([0.6, 0, 0, 1]));
    const r = d.report({ hasData: true, generation: 3 });
    expect(r.meanCoherence).toBeCloseTo(0.8, 6);
    expect(r.maxCoherence).toBe(1);
    expect(r.generation).toBe(3);
  });

  it('reports zeroed coherence before any readback has landed', () => {
    const d = createOrientationDiagnostics();
    const r = d.report(NO_READBACK);
    expect(r.meanCoherence).toBe(0);
    expect(r.maxCoherence).toBe(0);
    expect(r.hasData).toBe(false);
  });
});
