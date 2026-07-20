/**
 * resolveStrategy — pins the render-strategy decouple (Joint 1). One boolean
 * (`timingService.enabled`) used to fuse two independent axes: timing-on/off and
 * the merged/perLayerTimed pass shape. These four pairs pin the genuine branch —
 * `'auto'` reproduces today's timing-derived choice, while an EXPLICIT override
 * is returned unchanged even when timing disagrees (the harness's production-true
 * timed mode: `'merged'` WITH timing on). They fail if the decouple regresses to
 * a plain `timingEnabled ? … : …`.
 */

import { describe, it, expect } from 'vitest';

import { resolveStrategy } from '../../../../src/services/engine/frame/resolveStrategy';

describe('resolveStrategy', () => {
  it("derives 'perLayerTimed' from timing-on under 'auto'", () => {
    expect(resolveStrategy('auto', true)).toBe('perLayerTimed');
  });

  it("derives 'merged' from timing-off under 'auto'", () => {
    expect(resolveStrategy('auto', false)).toBe('merged');
  });

  it("returns the explicit 'merged' override even when timing is on", () => {
    expect(resolveStrategy('merged', true)).toBe('merged');
  });

  it("returns the explicit 'perLayerTimed' override even when timing is off", () => {
    expect(resolveStrategy('perLayerTimed', false)).toBe('perLayerTimed');
  });
});
