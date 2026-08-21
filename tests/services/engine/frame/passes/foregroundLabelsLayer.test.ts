/**
 * foregroundLabelsLayer — now a thin draw-call shim over what
 * `foregroundLabelDirector` already uploaded earlier in `runFrame` (spec §5.2).
 *
 * `enabled` must read `renderer.glyphCount()` fresh every call — the "latches
 * false forever" regression is now impossible by construction, since the
 * upload happens outside this layer's own `draw` (in the director), so there
 * is no same-frame ordering for a stale artifact to hide behind.
 */

import { describe, it, expect, vi } from 'vitest';

import { foregroundLabelsLayer } from '../../../../../src/services/engine/frame/passes/foregroundLabelsLayer';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import { near0LabelProjection } from '../../../../../src/services/engine/frame/near0LabelProjection';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../../../src/@types/rendering/MarkerLineRenderer';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

// `draw` no longer reads its `view` argument — the projection comes from
// `near0LabelProjection(ctx)` instead (the shared lookup the director itself
// uses) — so every test hands it an otherwise-empty stub.
const VIEW_STUB = {} as unknown as SlabView;

function makeRenderer(glyphCount: number): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label2D[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    measure: vi.fn<() => null>(() => null),
    glyphCount: () => glyphCount,
    labelCount: () => 0,
    destroy: vi.fn(),
  } as unknown as LabelRenderer;
}

function makeLineRenderer(): MarkerLineRenderer {
  return {
    label: 'foregroundMarkerLineRenderer',
    setLines: vi.fn<() => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    lineCount: () => 0,
    destroy: vi.fn(),
  } as unknown as MarkerLineRenderer;
}

function makeState(
  renderer: LabelRenderer | null,
  lineRenderer: MarkerLineRenderer | null = makeLineRenderer(),
): EngineState {
  return {
    gpu: { foregroundLabelRenderer: renderer, foregroundMarkerLineRenderer: lineRenderer },
  } as unknown as EngineState;
}

// A real NEAR0 slab (not mocked) — `near0LabelProjection` runs the genuine
// `rebaseViewProj` + `narrowMat4` chain against it, matching what the director
// resolves for the same `ctx` this frame.
function makeCtx(): ReadyFrameContext {
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
    slabs: [slab],
    drawCamPos: [2, 3, 5],
    canvasSize: { width: 1280, height: 720 },
    renderTargets: { depthViewOf: () => ({}) as GPUTextureView },
    renderedTargets: new Set(['foreground:0']),
  } as unknown as ReadyFrameContext;
}

describe('foregroundLabelsLayer.enabled', () => {
  it("tracks the director's last flush, and re-opens when demand returns", () => {
    // This is the "latches false forever" regression in its new shape: since
    // `draw` never calls `setLabels`/`setLines` any more (the director does,
    // earlier in `runFrame`), this test never calls `draw` either — proving
    // `enabled` reads real upload state, not something the layer itself just
    // produced.
    expect(foregroundLabelsLayer.enabled(makeState(makeRenderer(3)), makeCtx())).toBe(true);
    expect(foregroundLabelsLayer.enabled(makeState(makeRenderer(0)), makeCtx())).toBe(false);
    expect(foregroundLabelsLayer.enabled(makeState(makeRenderer(2)), makeCtx())).toBe(true);
  });

  it('is false pre-bootstrap, before the renderer exists', () => {
    expect(foregroundLabelsLayer.enabled(makeState(null), makeCtx())).toBe(false);
  });
});

describe('foregroundLabelsLayer.draw', () => {
  it('resolves the shared NEAR0 projection (near0LabelProjection(ctx)) and draws the labels through it', () => {
    const renderer = makeRenderer(3);
    const state = makeState(renderer, null);
    const ctx = makeCtx();

    foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, ctx, state);

    // Memoised per ctx — calling it again here returns the SAME object the
    // layer consumed, so identity proves the layer used the shared lookup
    // rather than re-deriving its own vp.
    const projection = near0LabelProjection(ctx);
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]).toEqual([PASS_STUB, projection.vpF32, projection.viewportPx, {}]);
  });

  it('draws the leader-line renderer through the same shared projection, before the labels', () => {
    const renderer = makeRenderer(3);
    const lineRenderer = makeLineRenderer();
    const state = makeState(renderer, lineRenderer);
    const ctx = makeCtx();
    const order: string[] = [];
    (lineRenderer.draw as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      order.push('line'),
    );
    (renderer.draw as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      order.push('label'),
    );

    foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, ctx, state);

    const projection = near0LabelProjection(ctx);
    const lineDrawSpy = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(lineDrawSpy).toHaveBeenCalledTimes(1);
    expect(lineDrawSpy.mock.calls[0]).toEqual([
      PASS_STUB,
      projection.vpF32,
      projection.viewportPx,
      {},
    ]);
    expect(order).toEqual(['line', 'label']);
  });

  it('draws captions even when the leader-line renderer is null (bootstrap gap)', () => {
    const renderer = makeRenderer(3);
    const state = makeState(renderer, null);
    foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, makeCtx(), state);
    expect(renderer.draw as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the foreground renderer is null (pre-bootstrap)', () => {
    const state = makeState(null);
    expect(() => foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, makeCtx(), state)).not.toThrow();
  });
});
