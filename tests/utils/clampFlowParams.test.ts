import { describe, it, expect } from 'vitest';
import { clampFlowParams } from '../../src/utils/clampFlowParams';
import { MAX_PARTICLES, MIN_TRAIL_STEP } from '../../src/data/flow/flowFieldConstants';
import { DEFAULT_FLOW } from '../../src/data/defaults';
import type { FlowSettings } from '../../src/@types/settings/FlowSettings';

// Build a full FlowSettings from the seed + overrides so the test never
// hand-maintains the whole shape.
const flowWith = (overrides: Partial<FlowSettings>): FlowSettings => ({
  ...DEFAULT_FLOW,
  ...overrides,
});

describe('clampFlowParams', () => {
  it('clampFlowParams caps count at MAX_PARTICLES and rounds', () => {
    expect(clampFlowParams(flowWith({ count: 1e9 })).count).toBe(MAX_PARTICLES);
    expect(clampFlowParams(flowWith({ count: 3.7 })).count).toBe(4);
  });

  it('clampFlowParams floors trail at MIN_TRAIL_STEP', () => {
    // A zero step stalls the advect compute loop — the GPU-hang guard.
    expect(clampFlowParams(flowWith({ trail: 0 })).trail).toBe(MIN_TRAIL_STEP);
  });

  it('clampFlowParams floors flowSpeed and wander at 0', () => {
    const f = clampFlowParams(flowWith({ flowSpeed: -5, wander: -2 }));
    expect(f.flowSpeed).toBe(0);
    expect(f.wander).toBe(0);
  });

  it('clampFlowParams bounds intensity and densityBias to [0,1]', () => {
    const lo = clampFlowParams(flowWith({ intensity: -0.5, densityBias: -3 }));
    expect(lo.intensity).toBe(0);
    expect(lo.densityBias).toBe(0);
    const hi = clampFlowParams(flowWith({ intensity: 2, densityBias: 9 }));
    expect(hi.intensity).toBe(1);
    expect(hi.densityBias).toBe(1);
  });

  it('clampFlowParams bounds boundaryFadeWidth to [0,0.5]', () => {
    expect(clampFlowParams(flowWith({ boundaryFadeWidth: -1 })).boundaryFadeWidth).toBe(0);
    expect(clampFlowParams(flowWith({ boundaryFadeWidth: 5 })).boundaryFadeWidth).toBe(0.5);
  });

  it('clampFlowParams passes enabled and mode through unchanged', () => {
    const f = clampFlowParams(flowWith({ enabled: true, mode: 'streamline' }));
    expect(f.enabled).toBe(true);
    expect(f.mode).toBe('streamline');
  });

  it('clampFlowParams does not mutate the input', () => {
    const input = flowWith({ count: 1e9, trail: 0, flowSpeed: -5, intensity: 2 });
    clampFlowParams(input);
    expect(input.count).toBe(1e9);
    expect(input.trail).toBe(0);
    expect(input.flowSpeed).toBe(-5);
    expect(input.intensity).toBe(2);
  });
});
