/**
 * foregroundLabelsOcclusion — guards the colour-view thread-through.
 *
 * The near-field captions and their leader lines occlude per-pixel behind an
 * opaque solar-system body by sampling the `foreground:0` scene colour's
 * alpha in their fragment shaders. That only fires if the layer actually
 * READS the colour view from `ctx.renderTargets` and hands it to BOTH
 * renderer draws as the optional 4th `sceneColorView` arg. Because that arg
 * is optional, a refactor could silently drop it — occlusion would turn OFF
 * with no type error and no failing draw-order test. This file pins the
 * thread-through by object identity: `viewOf('foreground:0')` is called, and
 * its return reaches both the caption and the leader-line draws.
 *
 * The rest of the mock scaffolding mirrors `foregroundLabelsLayer.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';

import { foregroundLabelsLayer } from '../../../../../src/services/engine/frame/passes/foregroundLabelsLayer';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../../../src/@types/rendering/MarkerLineRenderer';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';
import type { MarkerLine } from '../../../../../src/@types/rendering/MarkerLine';

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

// A real NEAR0 slab — `near0LabelProjection` runs the genuine rebase chain
// against it; these tests only care about the colour-view seam, not the
// resulting vp, so its exact values don't matter.
function makeCtx(
  renderedTargets: ReadonlySet<string>,
  viewOf: (id: string) => GPUTextureView,
): ReadyFrameContext {
  const slab: Slab = makeSlab();
  return {
    slabs: [slab],
    drawCamPos: [2, 3, 5],
    canvasSize: { width: 1280, height: 720 },
    renderTargets: { viewOf },
    renderedTargets,
  } as unknown as ReadyFrameContext;
}

function makeRenderer(): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label2D[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    measure: vi.fn<() => null>(() => null),
    glyphCount: () => 6,
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

function makeState(renderer: LabelRenderer, lineRenderer: MarkerLineRenderer): EngineState {
  return {
    gpu: { foregroundLabelRenderer: renderer, foregroundMarkerLineRenderer: lineRenderer },
  } as unknown as EngineState;
}

// `view` is unused by `draw` (the projection comes from `near0LabelProjection(ctx)`).
const VIEW_STUB = {} as unknown as SlabView;

describe('foregroundLabelsLayer.draw — coverage occlusion thread-through', () => {
  it('passes the foreground:0 colour view to both draws when the body pass ran this frame', () => {
    const renderer = makeRenderer();
    const lineRenderer = makeLineRenderer();
    const state = makeState(renderer, lineRenderer);
    const sentinelColorView = {} as GPUTextureView;
    const viewOf = vi.fn<(id: string) => GPUTextureView>(() => sentinelColorView);
    // `foreground:0` in the rendered set means the body pass drew this frame,
    // so the colour is valid to sample.
    const ctx = makeCtx(new Set(['foreground:0']), viewOf);

    foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, ctx, state);

    expect(viewOf).toHaveBeenCalledWith('foreground:0');
    const labelDraw = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    const lineDraw = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(labelDraw.mock.calls[0]![3]).toBe(sentinelColorView);
    expect(lineDraw.mock.calls[0]![3]).toBe(sentinelColorView);
  });

  it('passes undefined colour to both draws when the body pass did NOT run this frame', () => {
    // The stale-colour fix: when no foreground body rendered (the executor skips
    // an empty render step), `foreground:0` is absent from `renderedTargets`, so
    // its colour texture is uninitialised. Sampling it would spuriously discard
    // EVERY caption. The layer must instead hand the renderers `undefined`, so
    // they fall back to their plain pipeline and draw the captions un-occluded.
    const renderer = makeRenderer();
    const lineRenderer = makeLineRenderer();
    const state = makeState(renderer, lineRenderer);
    const viewOf = vi.fn<(id: string) => GPUTextureView>(() => ({}) as GPUTextureView);
    const ctx = makeCtx(new Set<string>(), viewOf);

    foregroundLabelsLayer.draw(PASS_STUB, VIEW_STUB, ctx, state);

    // The stale colour is never even read.
    expect(viewOf).not.toHaveBeenCalled();
    const labelDraw = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    const lineDraw = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(labelDraw.mock.calls[0]![3]).toBeUndefined();
    expect(lineDraw.mock.calls[0]![3]).toBeUndefined();
  });
});
