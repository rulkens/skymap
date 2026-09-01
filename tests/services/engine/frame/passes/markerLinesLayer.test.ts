/**
 * markerLinesLayer — enable gate + the coverage-view thread-through (Task 12).
 *
 * `draw` occludes leader lines per-pixel behind an opaque body by sampling
 * 'foreground:0's COLOUR view (its alpha, via lib/sceneDepth.wesl), not its
 * depth view — each painter-chain row clears its own depth (spec §7.3), so
 * the depth buffer can no longer back a coverage test. This is the cross-file
 * contract the checklist calls for: it fails if the layer is ever pointed
 * back at `depthViewOf`, or if the view stops reaching the renderer's draw.
 */

import { describe, it, expect, vi } from 'vitest';

import { markerLinesLayer } from '../../../../../src/services/engine/frame/passes/markerLinesLayer';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { MarkerLineRenderer } from '../../../../../src/@types/rendering/MarkerLineRenderer';

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;
const VIEW_STUB = { vp: new Float32Array(16), viewportPx: [1280, 720] } as unknown as SlabView;

function makeRenderer(lineCount: number): MarkerLineRenderer {
  return {
    label: 'markerLineRenderer',
    setLines: vi.fn(),
    draw: vi.fn(),
    lineCount: () => lineCount,
    destroy: vi.fn(),
  } as unknown as MarkerLineRenderer;
}

function makeState(renderer: MarkerLineRenderer | null): EngineState {
  return { gpu: { markerLineRenderer: renderer } } as unknown as EngineState;
}

function makeCtx(
  renderedTargets: ReadonlySet<string>,
  viewOf: (id: string) => GPUTextureView,
  depthViewOf: (id: string) => GPUTextureView,
): ReadyFrameContext {
  return {
    renderedTargets,
    renderTargets: { viewOf, depthViewOf } as unknown as ReadyFrameContext['renderTargets'],
  } as unknown as ReadyFrameContext;
}

describe('markerLinesLayer.enabled', () => {
  it('is false when the renderer is null', () => {
    const ctx = makeCtx(new Set(), vi.fn(), vi.fn());
    expect(markerLinesLayer.enabled(makeState(null), ctx, VIEW_STUB)).toBe(false);
  });

  it('is false when lineCount() is 0, true otherwise', () => {
    const ctx = makeCtx(new Set(), vi.fn(), vi.fn());
    expect(markerLinesLayer.enabled(makeState(makeRenderer(0)), ctx, VIEW_STUB)).toBe(false);
    expect(markerLinesLayer.enabled(makeState(makeRenderer(2)), ctx, VIEW_STUB)).toBe(true);
  });
});

describe('markerLinesLayer.draw', () => {
  it("passes the foreground:0 colour view (not the depth view) as draw's 4th arg when the body pass ran", () => {
    const renderer = makeRenderer(2);
    const sentinelColorView = {} as GPUTextureView;
    const viewOf = vi.fn<(id: string) => GPUTextureView>(() => sentinelColorView);
    const depthViewOf = vi.fn<(id: string) => GPUTextureView>(() => ({}) as GPUTextureView);
    const ctx = makeCtx(new Set(['foreground:0']), viewOf, depthViewOf);

    markerLinesLayer.draw(PASS_STUB, VIEW_STUB, ctx, makeState(renderer));

    expect(viewOf).toHaveBeenCalledWith('foreground:0');
    expect(depthViewOf).not.toHaveBeenCalled();
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledWith(
      PASS_STUB,
      VIEW_STUB.vp,
      VIEW_STUB.viewportPx,
      sentinelColorView,
    );
  });

  it('passes undefined when the body pass did NOT run this frame (stale/uninitialised colour)', () => {
    const renderer = makeRenderer(2);
    const viewOf = vi.fn<(id: string) => GPUTextureView>(() => ({}) as GPUTextureView);
    const ctx = makeCtx(new Set<string>(), viewOf, vi.fn());

    markerLinesLayer.draw(PASS_STUB, VIEW_STUB, ctx, makeState(renderer));

    expect(viewOf).not.toHaveBeenCalled();
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy.mock.calls[0]![3]).toBeUndefined();
  });
});
