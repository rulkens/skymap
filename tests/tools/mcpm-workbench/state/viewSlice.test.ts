import { describe, expect, it } from 'vitest';
import {
  defaultViewSlice,
  viewSlice,
} from '../../../../tools/mcpm-workbench/src/state/slices/viewSlice';

describe('viewSlice setPathTracerDivisor', () => {
  it('writes only pathTracer.divisor, sibling fields and other slices untouched', () => {
    const next = viewSlice.reducer(defaultViewSlice, viewSlice.actions.setPathTracerDivisor(4));
    expect(next.pathTracer.divisor).toBe(4);
    expect(next.pathTracer.sigmaT).toBe(defaultViewSlice.pathTracer.sigmaT);
    expect(next.raymarch).toBe(defaultViewSlice.raymarch);
    expect(next.camera).toBe(defaultViewSlice.camera);
  });
});
