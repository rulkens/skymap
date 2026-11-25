/**
 * renderFrame — plan-row wiring. A `once`-scope section's plan rows run
 * before `scheduleCubemapCaptures` (it reads the settling vote) and before
 * any encoder exists; a `perView` section's own plan rows run once per view,
 * before that view's own encoder opens.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeFrameMock, scheduleMock } = vi.hoisted(() => ({
  executeFrameMock: vi.fn(),
  scheduleMock: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/executeFrame', () => ({
  executeFrame: executeFrameMock,
}));
vi.mock('../../../../src/services/engine/frame/scheduleCubemapCaptures', () => ({
  scheduleCubemapCaptures: scheduleMock,
}));

import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { createFramePlannerResultStore } from '../../../../src/services/engine/frame/createFramePlannerResultStore';
import { VIEW_RIGS } from '../../../../src/data/rendering/viewRigs';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import type { FrameContentPlanner } from '../../../../src/@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const VIEW_RIG_KEY = '__plansTest';

describe('renderFrame — plan rows', () => {
  let order: string[];

  beforeEach(() => {
    order = [];
    executeFrameMock.mockReset();
    scheduleMock.mockReset();
    scheduleMock.mockImplementation(() => {
      order.push('schedule');
      return new Map();
    });
    delete (VIEW_RIGS as Record<string, unknown>)[VIEW_RIG_KEY];
  });

  it('runs a once-section plan before scheduleCubemapCaptures, and a perView-section plan per view before that view opens its own encoder', () => {
    const snapshot = {
      isReady: true,
      slabBodyCandidates: [],
      nowMs: 0,
      focus: {},
      focusBlend: 0,
      renderTargets: { viewOf: () => ({}), specOf: () => ({ format: 'bgra8unorm' }) },
      renderedTargets: new Set<string>(),
      plans: createFramePlannerResultStore(),
    };
    const makeView = (viewSlot: number): FrameView =>
      ({
        snapshot,
        vp: new Float32Array(16),
        slabs: [],
        canvasSize: { width: 10, height: 10 },
        drawCamPos: [0, 0, 0],
        drawPxPerRad: 1,
        viewSlot,
        viewKind: 'frame',
        bodyPose: () => null,
      }) as unknown as FrameView;
    const canvas = makeView(0);
    const view1 = makeView(1);
    const view2 = makeView(2);

    let perViewRuns = 0;
    const oncePlanner: FrameContentPlanner<number> = {
      name: 'once-stub',
      scope: 'once',
      plan: () => {
        order.push('once-plan');
        return { value: 1, awake: false, settling: false, loading: false };
      },
    };
    const perViewPlanner: FrameContentPlanner<string> = {
      name: 'per-view-stub',
      scope: 'perView',
      plan: () => {
        perViewRuns += 1;
        const value = `run-${perViewRuns}`;
        order.push(`perView-plan:${value}`);
        return { value, awake: false, settling: false, loading: false };
      },
    };
    const stubPass = { name: 'stub-pass', enabled: () => true, draw: vi.fn() };
    executeFrameMock.mockImplementation((args: { ctx: FrameView }) => {
      order.push(`executeFrame:${args.ctx.viewSlot}`);
    });

    (VIEW_RIGS as Record<string, unknown>)[VIEW_RIG_KEY] = {
      views: () => [],
      program: [
        { scope: 'once', steps: [{ kind: 'plan', name: 'once-stub' }] },
        {
          scope: 'perView',
          steps: [
            { kind: 'plan', name: 'per-view-stub' },
            { kind: 'render', target: 'hdr', slab: 0, passes: ['stub-pass'] },
          ],
        },
      ],
    };

    const state = {
      viewRig: VIEW_RIG_KEY,
      frameIndex: 0,
      perViewPlanMemory: new Map(),
      gpu: { focusUniform: null },
      settings: {
        debug: { renderStrategy: 'auto' },
        tonemap: { exposure: 1, curve: 0 },
        hdr: { enabled: false, knee: 0, headroom: 0 },
        bloom: { enabled: false },
        film: { enabled: false },
      },
      passes: [stubPass],
      planners: [oncePlanner, perViewPlanner],
    } as unknown as EngineState;

    const device = {
      createCommandEncoder: vi.fn(() => ({ finish: () => ({}) })),
      queue: { submit: vi.fn() },
    } as unknown as GPUDevice;
    const context = {
      getCurrentTexture: () => ({ createView: () => ({}) }),
    } as unknown as GPUCanvasContext;

    try {
      renderFrame({
        canvas,
        views: [view1, view2],
        state,
        device,
        context,
        timingService: createDisabledGpuTimingService(),
        renderedTargets: new Set<string>(),
      });
    } finally {
      delete (VIEW_RIGS as Record<string, unknown>)[VIEW_RIG_KEY];
    }

    // (a) the once planner ran exactly once, ahead of the capture scheduler.
    expect(order.filter((entry) => entry === 'once-plan')).toHaveLength(1);
    expect(order.indexOf('once-plan')).toBeLessThan(order.indexOf('schedule'));

    // (b) the perView planner ran once per view, each run before that view's
    // own `executeFrame` call (its encoder).
    expect(perViewRuns).toBe(2);
    expect(order.indexOf('perView-plan:run-1')).toBeLessThan(order.indexOf('executeFrame:1'));
    expect(order.indexOf('perView-plan:run-2')).toBeLessThan(order.indexOf('executeFrame:2'));

    // (c) the second view's own run landed under ITS identity, not view1's.
    expect(snapshot.plans.get(perViewPlanner, view2)).toBe('run-2');
    expect(snapshot.plans.get(perViewPlanner, view1)).toBe('run-1');
  });

  it("a perView planner gets its own view id's previous value as prev, and undefined for an id absent last frame", () => {
    const counter: FrameContentPlanner<number> = {
      name: 'counter',
      scope: 'perView',
      plan: (_view, _state, prev) => ({
        value: (prev ?? 0) + 1,
        awake: false,
        settling: false,
        loading: false,
      }),
    };
    (VIEW_RIGS as Record<string, unknown>)[VIEW_RIG_KEY] = {
      views: () => [],
      program: [{ scope: 'perView', steps: [{ kind: 'plan', name: 'counter' }] }],
    };
    const state = {
      viewRig: VIEW_RIG_KEY,
      frameIndex: 0,
      perViewPlanMemory: new Map(),
      gpu: { focusUniform: null },
      settings: {
        debug: { renderStrategy: 'auto' },
        tonemap: { exposure: 1, curve: 0 },
        hdr: { enabled: false, knee: 0, headroom: 0 },
        bloom: { enabled: false },
        film: { enabled: false },
      },
      passes: [],
      planners: [counter],
    } as unknown as EngineState;
    const device = {
      createCommandEncoder: vi.fn(() => ({ finish: () => ({}) })),
      queue: { submit: vi.fn() },
    } as unknown as GPUDevice;
    const context = {
      getCurrentTexture: () => ({ createView: () => ({}) }),
    } as unknown as GPUCanvasContext;

    /** One frame over views with these ids, each frame on a fresh store; returns each id's value. */
    const frame = (ids: readonly string[]): Record<string, number> => {
      const snapshot = {
        renderTargets: { viewOf: () => ({}), specOf: () => ({ format: 'bgra8unorm' }) },
        focus: {},
        plans: createFramePlannerResultStore(),
      };
      const views = ids.map((id) => ({ id, snapshot, slabs: [] }) as unknown as FrameView);
      renderFrame({
        canvas: views[0]!,
        views,
        state,
        device,
        context,
        timingService: createDisabledGpuTimingService(),
        renderedTargets: new Set<string>(),
      });
      return Object.fromEntries(views.map((view) => [view.id, snapshot.plans.get(counter, view)]));
    };

    try {
      expect(frame(['a', 'b'])).toEqual({ a: 1, b: 1 });
      expect(frame(['a'])).toEqual({ a: 2 });
      expect(frame(['a', 'b'])).toEqual({ a: 3, b: 1 });
    } finally {
      delete (VIEW_RIGS as Record<string, unknown>)[VIEW_RIG_KEY];
    }
  });
});
