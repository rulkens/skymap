/**
 * labelsNearPass — a thin draw-call shim over the records `runLabelDirector` uploaded earlier
 * in `runFrame`. `enabled` must follow the NEAR0 director every call (no latch), and `draw`
 * must hand the renderer the director's view plus the occlusion joint the captions clip by.
 */

import { describe, it, expect, vi } from 'vitest';

import { labelsNearPass } from '../../../../../src/services/engine/frame/passes/labelsNearPass';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { LabelRecordView } from '../../../../../src/@types/rendering/LabelRecordView';

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

// A null row leaves the depth frame unresolved, which is what pins the far-placeholder
// pairing below.
const VIEW_STUB = {
  sampledDepth: { view: {} as GPUTextureView, row: null },
} as unknown as SlabView;

const VIEW_RECORDS = { projection: { sizePx: [1280, 720] } } as unknown as LabelRecordView;

// `ctx.renderTargets`' two views, distinct objects so the pairing is provable.
const COLOR_VIEW = {} as GPUTextureView;
const FAR_DEPTH_VIEW = {} as GPUTextureView;
const SCENE_STUB = { colorView: COLOR_VIEW, depthView: FAR_DEPTH_VIEW, frame: null };

function makeRenderer(): LabelRenderer {
  return {
    label: 'labelRenderer',
    set: vi.fn(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    destroy: vi.fn(),
  } as unknown as LabelRenderer;
}

function makeDirector(count: number) {
  return { row: { slab: NEAR0 }, idle: false, records: { count }, frame: {}, view: VIEW_RECORDS };
}

function makeState(
  renderer: LabelRenderer | null,
  director: ReturnType<typeof makeDirector>,
): EngineState {
  return {
    gpu: { labelRendererNear: renderer },
    subsystems: { labelDirectors: [director] },
  } as unknown as EngineState;
}

const CTX = {
  snapshot: {
    renderTargets: { viewOf: () => COLOR_VIEW, farDepthView: () => FAR_DEPTH_VIEW },
    renderedTargets: new Set(['foreground:0']),
  },
} as unknown as FrameView;

describe('labelsNearPass.enabled', () => {
  it('follows the director each call: closed while idle or empty, open again when it shows', () => {
    const director = makeDirector(2);
    const state = makeState(makeRenderer(), director);
    expect(labelsNearPass.enabled(state, CTX, VIEW_STUB)).toBe(true);
    director.idle = true;
    expect(labelsNearPass.enabled(state, CTX, VIEW_STUB)).toBe(false);
    director.idle = false;
    director.records.count = 0;
    expect(labelsNearPass.enabled(state, CTX, VIEW_STUB)).toBe(false);
    director.records.count = 1;
    expect(labelsNearPass.enabled(state, CTX, VIEW_STUB)).toBe(true);
  });
});

describe('labelsNearPass.draw', () => {
  it("draws the director's records through its view, with the occlusion joint", () => {
    const renderer = makeRenderer();
    const state = makeState(renderer, makeDirector(1));

    labelsNearPass.draw(PASS_STUB, VIEW_STUB, CTX, state);

    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy.mock.calls).toEqual([[PASS_STUB, VIEW_RECORDS, SCENE_STUB]]);
  });
});
