/**
 * foregroundLabelsOcclusion — guards the depth-view thread-through.
 *
 * The near-field captions and their leader lines occlude per-pixel behind
 * nearer solar-system bodies by sampling the `foreground:0` scene depth in
 * their fragment shaders. That only fires if the layer actually READS the
 * depth view from `ctx.renderTargets` and hands it to BOTH renderer draws as
 * the optional 4th `sceneDepthView` arg. Because that arg is optional, a
 * refactor could silently drop it — occlusion would turn OFF with no type
 * error and no failing draw-order test. This file pins the thread-through by
 * object identity: `depthViewOf('foreground:0')` is called, and its return
 * reaches both the caption and the leader-line draws.
 *
 * The rest of the mock scaffolding mirrors `foregroundLabelsLayer.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';

import { foregroundLabelsLayer } from '../../../../../src/services/engine/frame/passes/foregroundLabelsLayer';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import { makeBodyItems } from '../../../../fixtures/makeBodyItems';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../../../src/@types/rendering/MarkerLineRenderer';
import type { Label } from '../../../../../src/@types/rendering/Label';
import type { MarkerLine } from '../../../../../src/@types/rendering/MarkerLine';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Same identity-vp rebase mock the sibling test uses: keeps every near-origin
// anchor in front of the camera so the lift chain produces finite endpoints.
vi.mock('../../../../../src/utils/camera/rebaseViewProj', () => ({
  rebaseViewProj: vi.fn<() => Float64Array>(
    () => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  ),
}));

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

let testClockMs = 0;
function makeCtx(distance: number, nowMs?: number): ReadyFrameContext {
  if (nowMs === undefined) {
    testClockMs += 60_000;
    nowMs = testClockMs;
  } else {
    testClockMs = Math.max(testClockMs, nowMs);
  }
  return { cam: { distance }, fovYRad: 1, nowMs } as unknown as ReadyFrameContext;
}

function makeRenderer(glyphCount: number): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    measure: vi.fn<() => null>(() => null),
    glyphCount: () => glyphCount,
  } as unknown as LabelRenderer;
}

function makeLineRenderer(): MarkerLineRenderer {
  return {
    label: 'foregroundMarkerLineRenderer',
    setLines: vi.fn<(lines: MarkerLine[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    lineCount: () => 0,
    destroy: vi.fn<() => void>(),
  } as unknown as MarkerLineRenderer;
}

function makeState(
  renderer: LabelRenderer | null,
  lineRenderer: MarkerLineRenderer | null = makeLineRenderer(),
): EngineState {
  return {
    gpu: { foregroundLabelRenderer: renderer, foregroundMarkerLineRenderer: lineRenderer },
    settings: {
      labels: { focusedOnly: false },
      bodies: { items: makeBodyItems() },
      starCatalogs: { enabled: true, items: { famousStar: { enabled: true, labelEnabled: true } } },
    },
    // No constellation slot: these occlusion tests exercise only the body
    // captions, so the layer reads an empty figure-name set. The key must exist
    // (the layer reads `.constellations`).
    assetSlots: { constellations: null },
    subsystems: { scheduler: { requestRender: vi.fn<() => void>() } },
  } as unknown as EngineState;
}

function makeNear0View(camPos: Vec3 = [2, 3, 5]): SlabView {
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: Float64Array.from({ length: 16 }, (_, i) => i + 0.5),
    originRelative: true,
    precision: 'f64',
    reversedZ: false,
  };
  return {
    slab,
    vp: new Float32Array(16),
    camPos,
    viewportPx: [1280, 720],
  };
}

describe('foregroundLabelsLayer.draw — depth occlusion thread-through', () => {
  it('passes the foreground:0 depth view to both draws when the body pass ran this frame', () => {
    const renderer = makeRenderer(6);
    const lineRenderer = makeLineRenderer();
    const state = makeState(renderer, lineRenderer);
    const view = makeNear0View();
    const sentinelDepthView = {} as GPUTextureView;
    const depthViewOf = vi.fn<(id: string) => GPUTextureView>(() => sentinelDepthView);
    // makeCtx returns a ReadyFrameContext; attach the renderTargets seam the
    // layer reads AND the renderedTargets guard — `foreground:0` in the set
    // means the body pass drew this frame, so the depth is valid to sample.
    const ctx = {
      ...makeCtx(5e-4),
      renderTargets: { depthViewOf },
      renderedTargets: new Set(['foreground:0']),
    } as unknown as ReadyFrameContext;

    foregroundLabelsLayer.draw(PASS_STUB, view, ctx, state);

    expect(depthViewOf).toHaveBeenCalledWith('foreground:0');
    const labelDraw = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    const lineDraw = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(labelDraw.mock.calls[0]![3]).toBe(sentinelDepthView);
    expect(lineDraw.mock.calls[0]![3]).toBe(sentinelDepthView);
  });

  it('passes undefined depth to both draws when the body pass did NOT run this frame', () => {
    // The stale-depth fix: when no foreground body rendered (the executor skips
    // an empty render step), `foreground:0` is absent from `renderedTargets`, so
    // its depth texture is uninitialised. Sampling it would spuriously discard
    // EVERY caption. The layer must instead hand the renderers `undefined`, so
    // they fall back to their plain pipeline and draw the captions un-occluded.
    const renderer = makeRenderer(6);
    const lineRenderer = makeLineRenderer();
    const state = makeState(renderer, lineRenderer);
    const view = makeNear0View();
    const depthViewOf = vi.fn<(id: string) => GPUTextureView>(() => ({}) as GPUTextureView);
    const ctx = {
      ...makeCtx(5e-4),
      renderTargets: { depthViewOf },
      renderedTargets: new Set<string>(),
    } as unknown as ReadyFrameContext;

    foregroundLabelsLayer.draw(PASS_STUB, view, ctx, state);

    // The stale depth is never even read.
    expect(depthViewOf).not.toHaveBeenCalled();
    const labelDraw = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    const lineDraw = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(labelDraw.mock.calls[0]![3]).toBeUndefined();
    expect(lineDraw.mock.calls[0]![3]).toBeUndefined();
  });
});
