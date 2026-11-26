import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { cosmicWebDensityPass } from '../../../../../src/layers/cosmicWebDensity/densityCubes/passes/cosmicWebDensityPass';
import { cosmicWebDensityUpsamplePass } from '../../../../../src/layers/cosmicWebDensity/densityCubes/passes/cosmicWebDensityUpsamplePass';
import { cosmicWebDensityAccumulationPlanner } from '../../../../../src/layers/cosmicWebDensity/frame';
import { INITIAL_SETTINGS } from '../../../../../src/state/settings/initialSettings';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { CosmicWebDensityRuntime } from '../../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import type { VolumeAccumulationPlan } from '../../../../../src/layers/cosmicWebDensity/@types/VolumeAccumulationPlan';

const draw = vi.fn();
const RUNTIME = {
  renderer: { hasActiveFields: () => true, draw },
  jitterMaskSlot: { state: () => ({ kind: 'ready' }) },
} as unknown as CosmicWebDensityRuntime;
const PLANNER = cosmicWebDensityAccumulationPlanner(RUNTIME);

const INPUTS = { jitterIndex: 77, steps: 128, weight: 0.25 };
const ctxPlanning = (planned: Pick<VolumeAccumulationPlan, 'draw'>) =>
  ({
    snapshot: {
      isReady: true,
      nowMs: 0,
      focusBlend: 0,
      focusPickId: null,
      plans: {
        get: (planner: { name: string }) => {
          expect(planner.name).toBe(PLANNER.name);
          return { ...planned, inputs: INPUTS };
        },
      },
      renderTargets: { sizeOf: () => ({ width: 100, height: 50 }) },
    },
    vp: new Float32Array(16) as unknown as Mat4,
    slabs: [],
    canvasSize: { width: 300, height: 150 },
    drawPxPerRad: 1,
    drawCamPos: [0, 0, 1],
  }) as unknown as FrameView;

const STATE = { settings: INITIAL_SETTINGS, frameIndex: 0, tier: 'medium' } as unknown as PassState;
const FADE = { mcpm: 1, 'polyphorm-2mrs': 0, 'mcpm-workbench': 0 };
const VIEW = { vp: new Float32Array(16), camPos: [0, 0, 0] } as unknown as SlabView;

describe('cosmicWebDensityPass', () => {
  const march = cosmicWebDensityPass(RUNTIME, PLANNER);
  const upsample = cosmicWebDensityUpsamplePass(RUNTIME);

  it('at the cap the march stops and the upsample keeps compositing', () => {
    // A march gate shared with the upsample made a converged volume vanish at rest: the retained
    // target holds the mean, so only the march may stop.
    const ctx = ctxPlanning({ draw: false });
    expect(march.enabled(STATE, ctx, VIEW, FADE)).toBe(false);
    expect(upsample.enabled(STATE, ctx, VIEW, FADE)).toBe(true);
  });

  it("below the cap both draw, and the march hands the renderer the plan's inputs", () => {
    const ctx = ctxPlanning({ draw: true });
    expect(march.enabled(STATE, ctx, VIEW, FADE)).toBe(true);
    expect(upsample.enabled(STATE, ctx, VIEW, FADE)).toBe(true);

    march.draw({} as GPURenderPassEncoder, VIEW, ctx, STATE, FADE);
    expect(draw).toHaveBeenCalledOnce();
    expect(draw.mock.calls[0]!.at(-1)).toEqual(INPUTS);
  });
});
