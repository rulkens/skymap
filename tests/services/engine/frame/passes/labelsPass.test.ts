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
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';

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

function makeRenderer(glyphCount: number): LabelRenderer {
  return {
    label: 'labelRenderer',
    setLabels: vi.fn(),
    draw: vi.fn(),
    measure: vi.fn(() => null),
    glyphCount: () => glyphCount,
    labelCount: () => 0,
    destroy: vi.fn(),
  } as unknown as LabelRenderer;
}

function makeState(renderer: LabelRenderer | null): EngineState {
  return { gpu: { labelRenderer: renderer } } as unknown as EngineState;
}

function makeCtx(
  renderedTargets: ReadonlySet<string>,
  viewOf: (id: string) => GPUTextureView,
  depthViewOf: (id: string) => GPUTextureView,
): ReadyFrameContext {
  return {
    renderedTargets,
    renderTargets: {
      viewOf,
      depthViewOf,
      farDepthView: () => FAR_DEPTH_VIEW,
    } as unknown as ReadyFrameContext['renderTargets'],
  } as unknown as ReadyFrameContext;
}

describe('labelsPass.enabled', () => {
  it('is false when glyphCount() is 0, true otherwise', () => {
    const ctx = makeCtx(new Set(), vi.fn(), vi.fn());
    expect(labelsPass.enabled(makeState(makeRenderer(0)), ctx, VIEW_STUB)).toBe(false);
    expect(labelsPass.enabled(makeState(makeRenderer(3)), ctx, VIEW_STUB)).toBe(true);
  });
});

describe('labelsPass.draw', () => {
  it("passes the foreground:0 colour view (not a depthViewOf lookup) in draw's joint when the body pass ran", () => {
    const renderer = makeRenderer(3);
    const sentinelColorView = {} as GPUTextureView;
    const viewOf = vi.fn<(id: string) => GPUTextureView>(() => sentinelColorView);
    const depthViewOf = vi.fn<(id: string) => GPUTextureView>(() => ({}) as GPUTextureView);
    const ctx = makeCtx(new Set(['foreground:0']), viewOf, depthViewOf);

    labelsPass.draw(PASS_STUB, VIEW_STUB, ctx, makeState(renderer));

    expect(viewOf).toHaveBeenCalledWith('foreground:0');
    expect(depthViewOf).not.toHaveBeenCalled();
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledWith(PASS_STUB, VIEW_STUB.vp, VIEW_STUB.viewportPx, {
      colorView: sentinelColorView,
      depthView: FAR_DEPTH_VIEW,
      frame: null,
    });
  });

  it('passes undefined when the body pass did NOT run this frame (stale/uninitialised colour)', () => {
    const renderer = makeRenderer(3);
    const viewOf = vi.fn<(id: string) => GPUTextureView>(() => ({}) as GPUTextureView);
    const ctx = makeCtx(new Set<string>(), viewOf, vi.fn());

    labelsPass.draw(PASS_STUB, VIEW_STUB, ctx, makeState(renderer));

    expect(viewOf).not.toHaveBeenCalled();
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy.mock.calls[0]![3]).toBeUndefined();
  });
});
