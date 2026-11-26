/**
 * labelsPass — enable gate + the coverage-view thread-through (Task 12).
 *
 * `draw` occludes captions per-pixel behind an opaque body by sampling
 * 'foreground:0's COLOUR view (its alpha, via lib/sceneDepth.wesl) for
 * coverage — each painter-chain row clears its own depth (spec §7.3), so the
 * depth buffer cannot back that test. Its depth comes from the step's own
 * `view.sampledDepth`, never a `depthViewOf` lookup here. This is the
 * cross-file contract the checklist calls for: it fails if the layer is ever
 * pointed back at `depthViewOf`, or if the joint stops reaching `draw`.
 */

import { describe, it, expect, vi } from 'vitest';

import { labelsPass } from '../../../../../src/services/engine/frame/passes/labelsPass';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { LabelRecordView } from '../../../../../src/@types/rendering/LabelRecordView';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import { COSMO, NEAR0 } from '../../../../../src/services/engine/frame/slabs';

const labelsCosmoPass = labelsPass({
  name: 'labels-cosmo',
  slab: COSMO,
  renderer: 'labelRendererCosmo',
  pickRenderer: 'labelPickRendererCosmo',
});

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;
// A null row leaves the depth frame unresolved, so the joint must carry the
// far placeholder — never the sampled view.
const SAMPLED_DEPTH_VIEW = {} as GPUTextureView;
const FAR_DEPTH_VIEW = {} as GPUTextureView;
const VIEW_STUB = {
  vp: new Float32Array(16),
  viewportPx: [1280, 720],
  sampledDepth: { view: SAMPLED_DEPTH_VIEW, row: null },
} as unknown as SlabView;

function makeRenderer(): LabelRenderer {
  return {
    label: 'labelRenderer',
    set: vi.fn(),
    draw: vi.fn(),
    destroy: vi.fn(),
  } as unknown as LabelRenderer;
}

// What the director remembers of its last frame; the draw passes it on.
const VIEW_RECORDS = { projection: { sizePx: [1280, 720] } } as unknown as LabelRecordView;

function makeState(renderer: LabelRenderer | null, recordCount = 0): EngineState {
  const director = {
    row: { slab: COSMO },
    idle: false,
    records: { count: recordCount },
    frame: {},
    view: VIEW_RECORDS,
  };
  return {
    gpu: { labelRendererCosmo: renderer },
    subsystems: { labelDirectors: [director] },
  } as unknown as EngineState;
}

function makeCtx(
  renderedTargets: ReadonlySet<string>,
  viewOf: (id: string) => GPUTextureView,
  depthViewOf: (id: string) => GPUTextureView,
): FrameView {
  return {
    snapshot: {
      renderTargets: {
        viewOf,
        depthViewOf,
        farDepthView: () => FAR_DEPTH_VIEW,
      } as unknown as FrameView['snapshot']['renderTargets'],
      renderedTargets,
    },
  } as unknown as FrameView;
}

describe('labelsPass.enabled', () => {
  it('is false while the director holds no records, true otherwise', () => {
    const ctx = makeCtx(new Set(), vi.fn(), vi.fn());
    expect(labelsCosmoPass.enabled(makeState(makeRenderer(), 0), ctx, VIEW_STUB)).toBe(false);
    expect(labelsCosmoPass.enabled(makeState(makeRenderer(), 3), ctx, VIEW_STUB)).toBe(true);
    expect(labelsCosmoPass.enabled(makeState(null, 3), ctx, VIEW_STUB)).toBe(false);
  });

  it('follows the director each call: closed while idle, open again when it shows', () => {
    const ctx = makeCtx(new Set(), vi.fn(), vi.fn());
    const state = makeState(makeRenderer(), 2);
    const director = state.subsystems.labelDirectors[0] as { idle: boolean };
    director.idle = true;
    expect(labelsCosmoPass.enabled(state, ctx, VIEW_STUB)).toBe(false);
    director.idle = false;
    expect(labelsCosmoPass.enabled(state, ctx, VIEW_STUB)).toBe(true);
  });

  it("reads its own row's renderer and director, not another row's", () => {
    const near = labelsPass({
      name: 'labels-near',
      slab: NEAR0,
      renderer: 'labelRendererNear',
      pickRenderer: 'labelPickRendererNear',
    });
    const ctx = makeCtx(new Set(), vi.fn(), vi.fn());
    expect(near.enabled(makeState(makeRenderer(), 3), ctx, VIEW_STUB)).toBe(false);
  });
});

describe('labelsPass.draw', () => {
  it("passes the foreground:0 colour view (not a depthViewOf lookup) in draw's joint when the body pass ran", () => {
    const renderer = makeRenderer();
    const sentinelColorView = {} as GPUTextureView;
    const viewOf = vi.fn<(id: string) => GPUTextureView>(() => sentinelColorView);
    const depthViewOf = vi.fn<(id: string) => GPUTextureView>(() => ({}) as GPUTextureView);
    const ctx = makeCtx(new Set(['foreground:0']), viewOf, depthViewOf);

    labelsCosmoPass.draw(PASS_STUB, VIEW_STUB, ctx, makeState(renderer, 1));

    expect(viewOf).toHaveBeenCalledWith('foreground:0');
    expect(depthViewOf).not.toHaveBeenCalled();
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledWith(PASS_STUB, VIEW_RECORDS, {
      kind: 'sampled-depth',
      colorView: sentinelColorView,
      depthView: FAR_DEPTH_VIEW,
      frame: null,
    });
  });

  it('passes undefined when the body pass did NOT run this frame (stale/uninitialised colour)', () => {
    const renderer = makeRenderer();
    const viewOf = vi.fn<(id: string) => GPUTextureView>(() => ({}) as GPUTextureView);
    const ctx = makeCtx(new Set<string>(), viewOf, vi.fn());

    labelsCosmoPass.draw(PASS_STUB, VIEW_STUB, ctx, makeState(renderer, 1));

    expect(viewOf).not.toHaveBeenCalled();
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy.mock.calls[0]![2]).toBeUndefined();
  });
});
