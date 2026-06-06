/**
 * Flow params — the spec arrays must agree with the per-mode defaults and with
 * the spike's range overrides.
 *
 * Every default value must sit inside the range its slider exposes (otherwise
 * the UI would render a thumb off the track, or clamp the look on first paint).
 * The advect trail range is the spike's tightened override, and wander is an
 * advect-only knob — both are parity-critical, so they get explicit checks.
 */
import { describe, expect, it } from 'vitest';
import {
  FLOW_PARAM_SPECS,
  FLOW_ADVECT_PARAM_SPECS,
} from '../../../../tools/flow-workbench/src/visualizations/flowField/params';
import { defaultFlowSlice } from '../../../../tools/flow-workbench/src/state/slices/flowSlice';

describe('flow params', () => {
  it('every streamline default sits within its FLOW_PARAM_SPECS range', () => {
    for (const spec of FLOW_PARAM_SPECS) {
      const value = defaultFlowSlice.streamline[spec.id as keyof typeof defaultFlowSlice.streamline];
      expect(value).toBeGreaterThanOrEqual(spec.min);
      expect(value).toBeLessThanOrEqual(spec.max);
    }
  });

  it('every advect default sits within its FLOW_ADVECT_PARAM_SPECS range', () => {
    for (const spec of FLOW_ADVECT_PARAM_SPECS) {
      const value = defaultFlowSlice.advect[spec.id as keyof typeof defaultFlowSlice.advect];
      expect(value).toBeGreaterThanOrEqual(spec.min);
      expect(value).toBeLessThanOrEqual(spec.max);
    }
  });

  it('advect trail range is the tightened override (0.0005..0.02)', () => {
    const trail = FLOW_ADVECT_PARAM_SPECS.find((s) => s.id === 'trail');
    expect(trail).toBeDefined();
    expect(trail?.min).toBe(0.0005);
    expect(trail?.max).toBe(0.02);
  });

  it('wander is present in advect specs and absent in streamline specs', () => {
    expect(FLOW_ADVECT_PARAM_SPECS.some((s) => s.id === 'wander')).toBe(true);
    expect(FLOW_PARAM_SPECS.some((s) => s.id === 'wander')).toBe(false);
  });
});
